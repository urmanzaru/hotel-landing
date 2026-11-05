/**
 * Visor de fotos sobre <dialog> nativo: foco atrapado, `Esc` para cerrar y retorno de foco los gestiona el
 * navegador; aquí solo se añade navegación (botones y flechas), clic en el fondo y el texto de posición.
 * Sin JavaScript, cada miniatura es un enlace a la foto grande.
 */

function setup(root: HTMLElement): void {
  const dialog = root.querySelector<HTMLDialogElement>('dialog');
  const image = dialog?.querySelector<HTMLImageElement>('[data-lightbox-img]');
  const caption = dialog?.querySelector<HTMLElement>('[data-lightbox-caption]');
  const position = dialog?.querySelector<HTMLElement>('[data-lightbox-pos]');
  const inner = dialog?.querySelector<HTMLElement>('[data-lightbox-inner]');
  const triggers = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-gallery-item]'));
  if (!dialog || !image || !caption || !position || triggers.length === 0) return;
  if (typeof dialog.showModal !== 'function') return; // navegador sin <dialog>: queda el enlace a la foto

  const template = root.dataset['position'] ?? '{current} / {total}';
  let index = 0;
  let opener: HTMLElement | null = null;

  const show = (next: number): void => {
    index = (next + triggers.length) % triggers.length;
    const trigger = triggers[index];
    if (!trigger) return;
    image.src = trigger.href;
    image.alt = trigger.dataset['alt'] ?? '';
    const text = trigger.dataset['caption'] ?? '';
    caption.textContent = text;
    caption.hidden = text === '';
    position.textContent = template
      .replace('{current}', String(index + 1))
      .replace('{total}', String(triggers.length));
  };

  triggers.forEach((trigger, i) => {
    trigger.addEventListener('click', (event) => {
      // Respeta Ctrl/Cmd/Shift + clic y clic central (abrir en otra pestaña).
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();
      opener = trigger;
      show(i);
      dialog.showModal();
    });
  });

  dialog.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-lightbox-next]')?.addEventListener('click', () => show(index + 1));
  dialog.querySelector('[data-lightbox-close]')?.addEventListener('click', () => dialog.close());

  // Clic en el fondo (fuera de la foto y los botones).
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target === inner) dialog.close();
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      show(index - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + 1);
    }
  });

  dialog.addEventListener('close', () => {
    image.removeAttribute('src');
    opener?.focus();
  });
}

document.querySelectorAll<HTMLElement>('[data-gallery]').forEach(setup);
