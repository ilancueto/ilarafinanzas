//! Actualización semi-auto (nivel B):
//! descarga el Setup de GitHub a temp, verifica SHA-256 opcional y lanza el instalador.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::AppHandle;

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| error.to_string())
}

fn is_allowed_update_url(url: &str) -> bool {
    let u = url.trim();
    u.starts_with("https://github.com/")
        || u.starts_with("https://objects.githubusercontent.com/")
        || u.starts_with("https://release-assets.githubusercontent.com/")
        || u.starts_with("https://github-releases.githubusercontent.com/")
}

fn sanitize_file_name(name: &str) -> String {
    let base = name
        .trim()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();
    if base.is_empty() || !base.to_ascii_lowercase().ends_with(".exe") {
        "Ilara-Finanzas-Setup.exe".into()
    } else {
        base
    }
}

fn hex_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn normalize_sha256(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("sha256:")
        .trim_start_matches("SHA256:")
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect::<String>()
        .to_ascii_lowercase()
}

/// Descarga el Setup a un directorio temporal del usuario.
/// Devuelve la ruta absoluta del archivo.
#[tauri::command]
pub fn download_app_setup(
    url: String,
    file_name: String,
    expected_sha256: Option<String>,
) -> Result<String, String> {
    let url = url.trim().to_string();
    if !is_allowed_update_url(&url) {
        return Err(
            "Solo se permiten descargas de update desde GitHub (github.com / objects.githubusercontent.com)."
                .into(),
        );
    }
    if !(url.starts_with("https://")) {
        return Err("La URL de descarga debe ser https.".into());
    }

    let safe_name = sanitize_file_name(&file_name);
    let mut dir = std::env::temp_dir();
    dir.push("ilara-updates");
    fs::create_dir_all(&dir).map_err(|error| format!("No se pudo crear carpeta temp: {error}"))?;

    let dest: PathBuf = dir.join(&safe_name);
    let client = http_client()?;
    let response = client
        .get(&url)
        .header(
            "User-Agent",
            "Ilara-Finanzas-Updater (https://github.com/ilancueto/ilarafinanzas)",
        )
        .send()
        .map_err(|error| format!("No se pudo descargar el Setup: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "GitHub respondió {} al descargar el Setup.",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .map_err(|error| format!("No se pudo leer el Setup: {error}"))?;
    if bytes.len() < 64_000 {
        return Err("El archivo descargado es demasiado chico para ser un Setup válido.".into());
    }
    // Guardrail: no tragar archivos enormes por error.
    if bytes.len() > 250 * 1024 * 1024 {
        return Err("El Setup supera el tamaño máximo esperado (250 MB).".into());
    }

    if let Some(expected) = expected_sha256
        .as_deref()
        .map(normalize_sha256)
        .filter(|s| !s.is_empty())
    {
        let actual = hex_sha256(&bytes);
        if actual != expected {
            return Err(format!(
                "SHA-256 no coincide (esperado {expected}, obtenido {actual}). No se instaló."
            ));
        }
    }

    {
        let mut file =
            File::create(&dest).map_err(|error| format!("No se pudo guardar el Setup: {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("No se pudo escribir el Setup: {error}"))?;
        file.flush()
            .map_err(|error| format!("No se pudo cerrar el Setup: {error}"))?;
    }

    dest.to_str()
        .map(str::to_string)
        .ok_or_else(|| "Ruta del Setup no es UTF-8 válida.".into())
}

/// Lanza el instalador NSIS y cierra Ilara.
/// `silent=true` usa `/S` (instalación silenciosa por usuario cuando el bundle lo permite).
#[tauri::command]
pub fn launch_app_setup_and_quit(app: AppHandle, path: String, silent: bool) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Falta la ruta del Setup.".into());
    }
    let path_buf = PathBuf::from(path);
    if !path_buf.is_file() {
        return Err("No se encontró el Setup descargado.".into());
    }
    // Solo .exe locales en temp de updates o rutas absolutas de archivo.
    let lower = path.to_ascii_lowercase();
    if !lower.ends_with(".exe") {
        return Err("El instalador debe ser un .exe.".into());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new(&path_buf);
        if silent {
            // NSIS (Tauri): instalación silenciosa.
            command.arg("/S");
        }
        command
            .spawn()
            .map_err(|error| format!("No se pudo iniciar el instalador: {error}"))?;
        // Dar un instante a que el proceso arranque antes de salir.
        std::thread::sleep(Duration::from_millis(400));
        app.exit(0);
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (app, silent, path_buf);
        Err("La instalación automática del Setup solo está disponible en Windows.".into())
    }
}

/// Calcula SHA-256 de un archivo local (hex minúsculas).
#[tauri::command]
pub fn hash_local_file_sha256(path: String) -> Result<String, String> {
    let path = PathBuf::from(path.trim());
    if !path.is_file() {
        return Err("Archivo no encontrado.".into());
    }
    let mut file =
        File::open(&path).map_err(|error| format!("No se pudo abrir el archivo: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buf = [0_u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .map_err(|error| format!("Error leyendo archivo: {error}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}
