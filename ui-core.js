/** Prevent duplicate execution while an asynchronous form submission is pending. */
export async function withSubmitLock(form, task) {
  if (!form || form.dataset?.submitting === "true") return false;
  form.dataset.submitting = "true";
  const controls = [...(form.querySelectorAll?.('button[type="submit"], input[type="submit"]') || [])];
  const previousDisabled = controls.map((control) => control.disabled);
  controls.forEach((control) => {
    control.disabled = true;
  });
  try {
    await task();
    return true;
  } finally {
    controls.forEach((control, index) => {
      control.disabled = previousDisabled[index];
    });
    delete form.dataset.submitting;
  }
}
