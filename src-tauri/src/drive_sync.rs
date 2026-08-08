//! Google Drive sync for Ilara: OAuth (PKCE + loopback) + single remote snapshot.
//! Scope: drive.file (only files created by this app).

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    net::TcpListener,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const CONFIG_FILE: &str = "drive_sync.json";
const REMOTE_FILE_NAME: &str = "ilara-sync.json";
const OAUTH_SCOPES: &str =
    "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_FILES_URL: &str = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3/files";

/// Serialize Drive network work so upload/download don't race tokens.
pub struct DriveLock(pub Mutex<()>);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DriveConfig {
    #[serde(default)]
    client_id: String,
    #[serde(default)]
    client_secret: String,
    #[serde(default)]
    auto_sync: bool,
    #[serde(default)]
    access_token: String,
    #[serde(default)]
    refresh_token: String,
    #[serde(default)]
    token_expiry_unix: u64,
    #[serde(default)]
    email: String,
    #[serde(default)]
    file_id: String,
    #[serde(default)]
    last_sync_at: String,
    #[serde(default)]
    last_remote_modified_time: String,
    #[serde(default)]
    last_content_hash: String,
    /// Local data changed after the last successful push/pull.
    #[serde(default)]
    local_dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DriveStatus {
    pub configured: bool,
    pub connected: bool,
    pub auto_sync: bool,
    pub email: String,
    pub last_sync_at: String,
    pub local_dirty: bool,
    pub has_remote: bool,
    pub remote_modified_time: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrivePullResult {
    pub action: String,
    pub status: DriveStatus,
    pub content: Option<String>,
    pub remote_modified_time: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DrivePushResult {
    pub action: String,
    pub status: DriveStatus,
    pub message: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join(CONFIG_FILE))
}

fn load_config(app: &AppHandle) -> Result<DriveConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(DriveConfig {
            auto_sync: true,
            ..DriveConfig::default()
        });
    }
    let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
    serde_json::from_str(&raw).map_err(|error| format!("Config Drive inválida: {error}"))
}

fn save_config(app: &AppHandle, config: &DriveConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, raw).map_err(|error| error.to_string())
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn now_iso() -> String {
    // Simple UTC-ish stamp for UI (not critical for ordering vs Drive modifiedTime).
    let secs = now_unix();
    format!("{secs}")
}

fn content_hash(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn base64_url_encode(bytes: &[u8]) -> String {
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes)
}

fn random_bytes(len: usize) -> Vec<u8> {
    let mut out = vec![0_u8; len];
    if getrandom::getrandom(&mut out).is_err() {
        for (index, slot) in out.iter_mut().enumerate() {
            *slot = ((now_unix() as u8).wrapping_add(index as u8)).wrapping_mul(17);
        }
    }
    out
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|error| error.to_string())
}

fn open_browser(url: &str) -> Result<(), String> {
    // IMPORTANT: On Windows, `cmd /C start … url` splits on `&` and truncates OAuth
    // URLs (multiple query params) → Google Error 400 invalid_request.
    #[cfg(target_os = "windows")]
    {
        // rundll32 keeps the full URL intact (including &query=params).
        let result = std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn();
        if result.is_ok() {
            return Ok(());
        }
        // Fallback: PowerShell Start-Process with a single-quoted URL.
        let escaped = url.replace('\'', "''");
        std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                &format!("Start-Process '{escaped}'"),
            ])
            .spawn()
            .map_err(|error| format!("No se pudo abrir el navegador: {error}"))?;
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("No se pudo abrir el navegador: {error}"))?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|error| format!("No se pudo abrir el navegador: {error}"))?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    {
        let _ = url;
        Err("Abrir navegador no soportado en esta plataforma".into())
    }
}

fn status_from(config: &DriveConfig, message: impl Into<String>) -> DriveStatus {
    DriveStatus {
        configured: !config.client_id.trim().is_empty() && !config.client_secret.trim().is_empty(),
        connected: !config.refresh_token.trim().is_empty(),
        auto_sync: config.auto_sync,
        email: config.email.clone(),
        last_sync_at: config.last_sync_at.clone(),
        local_dirty: config.local_dirty,
        has_remote: !config.file_id.trim().is_empty(),
        remote_modified_time: config.last_remote_modified_time.clone(),
        message: message.into(),
    }
}

fn ensure_access_token(app: &AppHandle, config: &mut DriveConfig) -> Result<String, String> {
    if config.refresh_token.trim().is_empty() {
        return Err("Google Drive no está conectado".into());
    }
    let skew = 60_u64;
    if !config.access_token.is_empty() && config.token_expiry_unix > now_unix().saturating_add(skew)
    {
        return Ok(config.access_token.clone());
    }
    if config.client_id.is_empty() || config.client_secret.is_empty() {
        return Err("Faltan Client ID / Client Secret de Google".into());
    }

    let client = http_client()?;
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("refresh_token", config.refresh_token.as_str()),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .map_err(|error| format!("Error al renovar token: {error}"))?;

    if !response.status().is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("Google rechazó el refresh token: {body}"));
    }

    let body: Value = response
        .json()
        .map_err(|error| format!("Respuesta de token inválida: {error}"))?;
    let access = body
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "Token de acceso ausente".to_string())?
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(Value::as_u64)
        .unwrap_or(3600);
    config.access_token = access.clone();
    config.token_expiry_unix = now_unix().saturating_add(expires_in);
    save_config(app, config)?;
    Ok(access)
}

fn fetch_email(access_token: &str) -> Result<String, String> {
    let client = http_client()?;
    let response = client
        .get(USERINFO_URL)
        .bearer_auth(access_token)
        .send()
        .map_err(|error| format!("No se pudo leer el perfil de Google: {error}"))?;
    if !response.status().is_success() {
        return Ok(String::new());
    }
    let body: Value = response.json().unwrap_or_else(|_| json!({}));
    Ok(body
        .get("email")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string())
}

fn find_remote_file(access_token: &str) -> Result<Option<(String, String)>, String> {
    let client = http_client()?;
    let query = format!(
        "name = '{}' and trashed = false",
        REMOTE_FILE_NAME.replace('\'', "\\'")
    );
    let response = client
        .get(DRIVE_FILES_URL)
        .bearer_auth(access_token)
        .query(&[
            ("q", query.as_str()),
            ("spaces", "drive"),
            ("fields", "files(id,modifiedTime,name)"),
            ("pageSize", "10"),
        ])
        .send()
        .map_err(|error| format!("Error al listar Drive: {error}"))?;
    if !response.status().is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("Drive list falló: {body}"));
    }
    let body: Value = response
        .json()
        .map_err(|error| format!("JSON de listado inválido: {error}"))?;
    let files = body
        .get("files")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut best: Option<(String, String)> = None;
    for file in files {
        let id = file
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let modified = file
            .get("modifiedTime")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            continue;
        }
        match &best {
            None => best = Some((id, modified)),
            Some((_, prev_mod)) if modified > *prev_mod => best = Some((id, modified)),
            _ => {}
        }
    }
    Ok(best)
}

fn download_file(access_token: &str, file_id: &str) -> Result<(String, String), String> {
    let client = http_client()?;
    let meta = client
        .get(format!("{DRIVE_FILES_URL}/{file_id}"))
        .bearer_auth(access_token)
        .query(&[("fields", "id,modifiedTime")])
        .send()
        .map_err(|error| format!("Error al leer meta Drive: {error}"))?;
    if !meta.status().is_success() {
        let body = meta.text().unwrap_or_default();
        return Err(format!("No se pudo leer el archivo remoto: {body}"));
    }
    let meta_body: Value = meta.json().map_err(|error| error.to_string())?;
    let modified = meta_body
        .get("modifiedTime")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let content_response = client
        .get(format!("{DRIVE_FILES_URL}/{file_id}"))
        .bearer_auth(access_token)
        .query(&[("alt", "media")])
        .send()
        .map_err(|error| format!("Error al descargar: {error}"))?;
    if !content_response.status().is_success() {
        let body = content_response.text().unwrap_or_default();
        return Err(format!("Descarga falló: {body}"));
    }
    let content = content_response.text().map_err(|error| error.to_string())?;
    if content.len() > 8 * 1024 * 1024 {
        return Err("El archivo remoto es demasiado grande".into());
    }
    Ok((content, modified))
}

fn upload_file(
    access_token: &str,
    file_id: Option<&str>,
    content: &str,
) -> Result<(String, String), String> {
    let client = http_client()?;
    let metadata = json!({
        "name": REMOTE_FILE_NAME,
        "mimeType": "application/json",
    });
    let metadata_str = metadata.to_string();
    let boundary = "ilara_boundary_7x4K9";
    let body = format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata_str}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n{content}\r\n--{boundary}--\r\n"
    );

    let response = if let Some(id) = file_id.filter(|value| !value.is_empty()) {
        client
            .patch(format!("{DRIVE_UPLOAD_URL}/{id}"))
            .bearer_auth(access_token)
            .query(&[("uploadType", "multipart"), ("fields", "id,modifiedTime")])
            .header(
                "Content-Type",
                format!("multipart/related; boundary={boundary}"),
            )
            .body(body)
            .send()
            .map_err(|error| format!("Error al actualizar Drive: {error}"))?
    } else {
        client
            .post(DRIVE_UPLOAD_URL)
            .bearer_auth(access_token)
            .query(&[("uploadType", "multipart"), ("fields", "id,modifiedTime")])
            .header(
                "Content-Type",
                format!("multipart/related; boundary={boundary}"),
            )
            .body(body)
            .send()
            .map_err(|error| format!("Error al subir a Drive: {error}"))?
    };

    if !response.status().is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("Subida a Drive falló: {body}"));
    }
    let body: Value = response.json().map_err(|error| error.to_string())?;
    let id = body
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Drive no devolvió id de archivo".to_string())?
        .to_string();
    let modified = body
        .get("modifiedTime")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    Ok((id, modified))
}

fn wait_for_oauth_code(listener: TcpListener) -> Result<(String, String), String> {
    listener
        .set_nonblocking(false)
        .map_err(|error| error.to_string())?;
    // Manual accept with timeout via SO doesn't work easily on all platforms;
    // use a short read deadline on the stream.
    let (mut stream, _) = listener
        .accept()
        .map_err(|error| format!("No llegó la autorización de Google: {error}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(180)));
    let mut buffer = [0_u8; 8192];
    let read = stream
        .read(&mut buffer)
        .map_err(|error| error.to_string())?;
    let request = String::from_utf8_lossy(&buffer[..read]);
    let first_line = request.lines().next().unwrap_or("");
    // GET /?code=...&scope=... HTTP/1.1
    let path = first_line.split_whitespace().nth(1).unwrap_or("");
    let query = path.split('?').nth(1).unwrap_or("");
    let mut params = HashMap::new();
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        if let (Some(key), Some(value)) = (parts.next(), parts.next()) {
            params.insert(
                urlencoding::decode(key).unwrap_or_default().into_owned(),
                urlencoding::decode(value).unwrap_or_default().into_owned(),
            );
        }
    }

    let html_ok = r#"<!doctype html><html><head><meta charset="utf-8"><title>Ilara</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1419;color:#e8eef5;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#1a2332;padding:2rem 2.5rem;border-radius:16px;max-width:28rem;text-align:center;border:1px solid #2a3a4f}
h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#9db0c5;margin:0;line-height:1.45}</style></head>
<body><div class="card"><h1>Listo</h1><p>Google autorizó Ilara. Podés cerrar esta pestaña y volver a la app.</p></div></body></html>"#;
    let html_err = r#"<!doctype html><html><head><meta charset="utf-8"><title>Ilara</title></head>
<body style="font-family:system-ui;background:#0f1419;color:#e8eef5;padding:2rem"><h1>No se pudo autorizar</h1><p>Cerrá esta pestaña y reintentá desde Ilara.</p></body></html>"#;

    if let Some(error) = params.get("error") {
        let _ = write!(
            stream,
            "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
            html_err.len(),
            html_err
        );
        return Err(format!("Google devolvió error: {error}"));
    }

    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| "Google no envió el código de autorización".to_string())?;

    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{}",
        html_ok.len(),
        html_ok
    );

    Ok((code, String::new()))
}

fn exchange_code(
    config: &DriveConfig,
    code: &str,
    redirect_uri: &str,
    code_verifier: &str,
) -> Result<(String, String, u64), String> {
    let client = http_client()?;
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("client_id", config.client_id.as_str()),
            ("client_secret", config.client_secret.as_str()),
            ("code", code),
            ("code_verifier", code_verifier),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .map_err(|error| format!("Error al intercambiar código: {error}"))?;
    if !response.status().is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("Google no entregó tokens: {body}"));
    }
    let body: Value = response.json().map_err(|error| error.to_string())?;
    let access = body
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or_else(|| "access_token ausente".to_string())?
        .to_string();
    let refresh = body
        .get("refresh_token")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let expires_in = body
        .get("expires_in")
        .and_then(Value::as_u64)
        .unwrap_or(3600);
    if refresh.is_empty() {
        return Err(
            "Google no envió refresh_token. En la consola de Google, revocá el acceso a Ilara y volvé a conectar con prompt=consent."
                .into(),
        );
    }
    Ok((access, refresh, expires_in))
}

#[tauri::command]
pub fn drive_get_status(app: AppHandle) -> Result<DriveStatus, String> {
    let config = load_config(&app)?;
    let msg = if !config.client_id.is_empty() && config.refresh_token.is_empty() {
        "Credenciales listas. Conectá Google para sincronizar."
    } else if config.refresh_token.is_empty() {
        "Pegá Client ID y Secret de Google (una sola vez)."
    } else if config.auto_sync {
        "Sincronización automática activa."
    } else {
        "Conectado (sync automática apagada)."
    };
    Ok(status_from(&config, msg))
}

#[tauri::command]
pub fn drive_save_credentials(
    app: AppHandle,
    client_id: String,
    client_secret: String,
) -> Result<DriveStatus, String> {
    let mut config = load_config(&app)?;
    config.client_id = client_id.trim().to_string();
    config.client_secret = client_secret.trim().to_string();
    if config.client_id.is_empty() || config.client_secret.is_empty() {
        return Err("Client ID y Client Secret son obligatorios".into());
    }
    save_config(&app, &config)?;
    Ok(status_from(
        &config,
        "Credenciales guardadas. Ahora conectá Google.",
    ))
}

#[tauri::command]
pub fn drive_set_auto_sync(app: AppHandle, enabled: bool) -> Result<DriveStatus, String> {
    let mut config = load_config(&app)?;
    config.auto_sync = enabled;
    save_config(&app, &config)?;
    Ok(status_from(
        &config,
        if enabled {
            "Sincronización automática activada."
        } else {
            "Sincronización automática desactivada."
        },
    ))
}

#[tauri::command]
pub fn drive_mark_local_dirty(app: AppHandle) -> Result<DriveStatus, String> {
    let mut config = load_config(&app)?;
    if !config.refresh_token.is_empty() {
        config.local_dirty = true;
        save_config(&app, &config)?;
    }
    Ok(status_from(&config, "Cambios locales pendientes de subir."))
}

#[tauri::command]
pub fn drive_disconnect(app: AppHandle) -> Result<DriveStatus, String> {
    let mut config = load_config(&app)?;
    config.access_token.clear();
    config.refresh_token.clear();
    config.token_expiry_unix = 0;
    config.email.clear();
    config.file_id.clear();
    config.last_sync_at.clear();
    config.last_remote_modified_time.clear();
    config.last_content_hash.clear();
    config.local_dirty = false;
    // Keep client_id/secret and auto_sync preference.
    save_config(&app, &config)?;
    Ok(status_from(&config, "Google desconectado en este equipo."))
}

#[tauri::command]
pub fn drive_connect(app: AppHandle, lock: State<DriveLock>) -> Result<DriveStatus, String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Sync Drive ocupado".to_string())?;
    let mut config = load_config(&app)?;
    config.client_id = config.client_id.trim().to_string();
    config.client_secret = config.client_secret.trim().to_string();
    if config.client_id.is_empty() || config.client_secret.is_empty() {
        return Err("Primero guardá Client ID y Client Secret de Google Cloud".into());
    }
    // Desktop OAuth client IDs look like *.apps.googleusercontent.com
    if !config.client_id.contains(".apps.googleusercontent.com") {
        return Err(
            "El Client ID no parece de Google OAuth (debería terminar en .apps.googleusercontent.com). Revisá que sea tipo «Aplicación de escritorio»."
                .into(),
        );
    }

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("No se pudo abrir puerto local: {error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    // Loopback without path; Desktop clients accept any port on 127.0.0.1.
    let redirect_uri = format!("http://127.0.0.1:{port}");

    let verifier_bytes = random_bytes(32);
    let code_verifier = base64_url_encode(&verifier_bytes);
    let challenge = {
        let mut hasher = Sha256::new();
        hasher.update(code_verifier.as_bytes());
        base64_url_encode(&hasher.finalize())
    };

    // Build query with urlencoding crate (keeps & separators only between params).
    let auth_url = format!(
        "{AUTH_URL}?client_id={}&redirect_uri={}&response_type=code&scope={}&code_challenge={}&code_challenge_method=S256&access_type=offline&prompt=consent&include_granted_scopes=true",
        urlencoding::encode(&config.client_id),
        urlencoding::encode(&redirect_uri),
        urlencoding::encode(OAUTH_SCOPES),
        urlencoding::encode(&challenge),
    );

    open_browser(&auth_url)?;
    let (code, _) = wait_for_oauth_code(listener)?;
    let (access, refresh, expires_in) =
        exchange_code(&config, &code, &redirect_uri, &code_verifier)?;
    config.access_token = access.clone();
    config.refresh_token = refresh;
    config.token_expiry_unix = now_unix().saturating_add(expires_in);
    config.email = fetch_email(&access).unwrap_or_default();
    config.auto_sync = true;
    config.local_dirty = true;
    save_config(&app, &config)?;
    Ok(status_from(
        &config,
        format!(
            "Conectado como {}. La sync automática quedó activa.",
            if config.email.is_empty() {
                "Google"
            } else {
                &config.email
            }
        ),
    ))
}

#[tauri::command]
pub fn drive_push(
    app: AppHandle,
    lock: State<DriveLock>,
    content: String,
    force: bool,
) -> Result<DrivePushResult, String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Sync Drive ocupado".to_string())?;
    if content.len() > 8 * 1024 * 1024 {
        return Err("Copia demasiado grande para subir".into());
    }

    let mut config = load_config(&app)?;
    let access = ensure_access_token(&app, &mut config)?;

    // Resolve remote file id if missing.
    if config.file_id.is_empty() {
        if let Some((id, modified)) = find_remote_file(&access)? {
            config.file_id = id;
            if config.last_remote_modified_time.is_empty() {
                config.last_remote_modified_time = modified;
            }
        }
    }

    // Conflict: remote moved ahead and we still have local dirty (unless force).
    if !force && !config.file_id.is_empty() {
        if let Ok((remote_content, remote_modified)) = download_file(&access, &config.file_id) {
            let remote_hash = content_hash(&remote_content);
            let local_hash = content_hash(&content);
            if remote_hash != local_hash
                && !config.last_remote_modified_time.is_empty()
                && remote_modified != config.last_remote_modified_time
                && config.local_dirty
            {
                return Ok(DrivePushResult {
                    action: "conflict".into(),
                    status: status_from(&config, "Conflicto: hay cambios locales y en Drive."),
                    message: "conflict".into(),
                });
            }
            if remote_hash == local_hash {
                config.local_dirty = false;
                config.last_content_hash = local_hash;
                config.last_remote_modified_time = remote_modified;
                config.last_sync_at = now_iso();
                save_config(&app, &config)?;
                return Ok(DrivePushResult {
                    action: "noop".into(),
                    status: status_from(&config, "Ya estaba al día con Drive."),
                    message: "noop".into(),
                });
            }
        }
    }

    let file_id = if config.file_id.is_empty() {
        None
    } else {
        Some(config.file_id.as_str())
    };
    let (id, modified) = upload_file(&access, file_id, &content)?;
    config.file_id = id;
    config.last_remote_modified_time = modified;
    config.last_content_hash = content_hash(&content);
    config.last_sync_at = now_iso();
    config.local_dirty = false;
    save_config(&app, &config)?;

    Ok(DrivePushResult {
        action: "uploaded".into(),
        status: status_from(&config, "Copia subida a Google Drive."),
        message: "uploaded".into(),
    })
}

#[tauri::command]
pub fn drive_pull(
    app: AppHandle,
    lock: State<DriveLock>,
    force: bool,
) -> Result<DrivePullResult, String> {
    let _guard = lock
        .0
        .lock()
        .map_err(|_| "Sync Drive ocupado".to_string())?;
    let mut config = load_config(&app)?;
    let access = ensure_access_token(&app, &mut config)?;

    let mut file_id = config.file_id.clone();
    let (content, modified) = if !file_id.is_empty() {
        match download_file(&access, &file_id) {
            Ok(pair) => pair,
            Err(_) => {
                let Some((id, _)) = find_remote_file(&access)? else {
                    config.file_id.clear();
                    save_config(&app, &config)?;
                    return Ok(DrivePullResult {
                        action: "empty".into(),
                        status: status_from(&config, "No hay copia todavía en Drive."),
                        content: None,
                        remote_modified_time: String::new(),
                        message: "empty".into(),
                    });
                };
                file_id = id.clone();
                download_file(&access, &id)?
            }
        }
    } else if let Some((id, _)) = find_remote_file(&access)? {
        file_id = id.clone();
        download_file(&access, &id)?
    } else {
        return Ok(DrivePullResult {
            action: "empty".into(),
            status: status_from(&config, "No hay copia todavía en Drive."),
            content: None,
            remote_modified_time: String::new(),
            message: "empty".into(),
        });
    };
    config.file_id = file_id;

    let remote_hash = content_hash(&content);

    if !force {
        if !config.last_content_hash.is_empty() && remote_hash == config.last_content_hash {
            config.last_remote_modified_time = modified.clone();
            save_config(&app, &config)?;
            return Ok(DrivePullResult {
                action: "noop".into(),
                status: status_from(&config, "Ya tenés la última copia de Drive."),
                content: None,
                remote_modified_time: modified,
                message: "noop".into(),
            });
        }
        if config.local_dirty
            && !config.last_remote_modified_time.is_empty()
            && modified != config.last_remote_modified_time
            && remote_hash != config.last_content_hash
        {
            return Ok(DrivePullResult {
                action: "conflict".into(),
                status: status_from(
                    &config,
                    "Conflicto: esta PC y Drive tienen cambios distintos.",
                ),
                content: Some(content),
                remote_modified_time: modified,
                message: "conflict".into(),
            });
        }
        // Local changes and remote still the last one we knew → push later.
        if config.local_dirty {
            save_config(&app, &config)?;
            return Ok(DrivePullResult {
                action: "local_ahead".into(),
                status: status_from(&config, "Hay cambios locales por subir."),
                content: None,
                remote_modified_time: modified,
                message: "local_ahead".into(),
            });
        }
    }

    save_config(&app, &config)?;
    Ok(DrivePullResult {
        action: "download".into(),
        status: status_from(&config, "Hay una copia más nueva en Drive."),
        content: Some(content),
        remote_modified_time: modified,
        message: "download".into(),
    })
}

#[tauri::command]
pub fn drive_confirm_pulled(
    app: AppHandle,
    content: String,
    remote_modified_time: String,
) -> Result<DriveStatus, String> {
    let mut config = load_config(&app)?;
    config.last_content_hash = content_hash(&content);
    config.last_remote_modified_time = remote_modified_time;
    config.last_sync_at = now_iso();
    config.local_dirty = false;
    save_config(&app, &config)?;
    Ok(status_from(
        &config,
        "Copia de Drive aplicada en este equipo.",
    ))
}
