// Discord's frame blocks the Clipboard API, which breaks the copy buttons on Next's
// dev error overlay. In development only, fall back to the older copy command.
if (process.env.NODE_ENV === "development" && navigator.clipboard) {
  const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (text) =>
    writeText(text).catch((err) => {
      const active = document.activeElement;
      const field = document.createElement("textarea");
      field.value = text;
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      if (active instanceof HTMLElement) active.focus();
      if (!copied) throw err;
    });
}
