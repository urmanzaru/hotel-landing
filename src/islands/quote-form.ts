/**
 * Isla del formulario de cotización (solo se carga en `/cotizar/` y `/en/quote/`).
 * - Validación al salir de cada campo y al enviar; errores en línea (`aria-invalid`, `aria-describedby`) y resumen
 *   enfocado si el envío falla por validación.
 * - Envío `POST /receiveCotization` con `fetch` y timeout de 15 s; SIN reintento automático (el endpoint no es
 *   idempotente: cada intento crea un registro). Botón deshabilitado y `aria-busy` durante el envío.
 * - Anti-spam: campo señuelo y tiempo mínimo desde la carga; si saltan, se simula el éxito sin enviar nada.
 * - Si la API falla, los datos se conservan y se ofrecen WhatsApp/correo precargados con el resumen.
 */
import type { Locale } from '../../clients/types.ts';
import {
  addDays,
  buildQuotePayload,
  childAgeFieldId,
  classifyResponse,
  errorMessageKey,
  format,
  isIsoDate,
  parsePrefill,
  quoteSummaryRows,
  quoteSummaryText,
  todayIn,
  validateQuote,
  type Messages,
  type QuoteError,
  type QuoteInput,
} from '../lib/quote.ts';

const TIMEOUT_MS = 15_000;
const MIN_FILL_MS = 3_000;

function setup(form: HTMLFormElement): void {
  const data = form.dataset;
  const endpoint = data['endpoint'] ?? '';
  const timeZone = data['timezone'] ?? 'UTC';
  const locale: Locale = data['locale'] === 'en' ? 'en' : 'es';
  const hotelName = data['hotel'] ?? '';
  const messages = JSON.parse(data['messages'] ?? '{}') as Messages;
  /** Nombre en español de cada habitación (las notas del PMS las lee el personal del hotel). */
  const roomNamesEs = JSON.parse(data['roomNames'] ?? '{}') as Record<string, string>;
  const startedAt = Date.now();

  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const control = (id: string) => byId<HTMLInputElement | HTMLSelectElement>(id);
  const value = (id: string) => control(id)?.value ?? '';
  const checked = (id: string) => byId<HTMLInputElement>(id)?.checked ?? false;

  const checkin = byId<HTMLInputElement>('checkin');
  const checkout = byId<HTMLInputElement>('checkout');
  const children = byId<HTMLSelectElement>('children');
  const rooms = byId<HTMLSelectElement>('rooms');
  const roomType = byId<HTMLSelectElement>('roomType');
  const together = byId<HTMLInputElement>('roomsTogether');
  const agesBox = form.querySelector<HTMLElement>('[data-child-ages]');
  const ageTemplate = form.querySelector<HTMLTemplateElement>('[data-child-age-template]');
  const summary = byId<HTMLElement>('quote-errors');
  const failure = form.querySelector<HTMLElement>('[data-quote-failure]');
  const success = document.querySelector<HTMLElement>('[data-quote-success]');
  const submit = form.querySelector<HTMLButtonElement>('[data-quote-submit]');
  const honeypot = byId<HTMLInputElement>('website');
  if (!checkin || !checkout || !children || !rooms || !agesBox || !ageTemplate || !submit) return;

  const today = () => todayIn(timeZone);

  // --- Niños: un selector de edad por niño, conservando las edades ya elegidas -------------------------------
  const renderChildAges = () => {
    const count = Number(children.value) || 0;
    const current = agesBox.querySelectorAll('.field').length;
    for (let i = current; i < count; i += 1) {
      const html = ageTemplate.innerHTML
        .replaceAll('child-age-0', childAgeFieldId(i))
        .replaceAll('{n}', String(i + 1));
      agesBox.insertAdjacentHTML('beforeend', html);
    }
    agesBox.querySelectorAll('.field').forEach((field, index) => {
      if (index >= count) field.remove();
    });
  };

  const syncTogether = () => {
    const wrapper = together?.closest<HTMLElement>('.check');
    if (!wrapper || !together) return;
    wrapper.hidden = Number(rooms.value) <= 1;
    if (wrapper.hidden) together.checked = false;
  };

  // --- Fechas: mínimo = hoy (zona del hotel); salida ≥ llegada + 1 -----------------------------------------
  // Ojo: mientras se teclea el año, Chromium emite fechas intermedias (`0002-11-20`) y reescribir `min` reinicia el
  // editor del campo; por eso solo se toca lo necesario y solo con una llegada válida desde hoy.
  const setMin = (input: HTMLInputElement, min: string) => {
    if (input.min !== min) input.min = min;
  };
  const syncDates = () => {
    const min = today();
    setMin(checkin, min);
    const valid = isIsoDate(checkin.value) && checkin.value >= min;
    setMin(checkout, addDays(valid ? checkin.value : min, 1));
    if (valid && (!checkout.value || checkout.value <= checkin.value)) {
      checkout.value = addDays(checkin.value, 1);
    }
  };

  // --- Lectura y errores --------------------------------------------------------------------------------------
  const read = (): QuoteInput => ({
    checkin: checkin.value,
    checkout: checkout.value,
    adults: value('adults'),
    childAges: Array.from(agesBox.querySelectorAll('select'), (select) => select.value),
    rooms: rooms.value,
    roomsTogether: checked('roomsTogether'),
    roomType: roomType?.value ?? '',
    name: value('name'),
    email: value('email'),
    phone: value('phone'),
    address: value('address'),
    notes: value('notes'),
    privacy: checked('privacy'),
  });

  const messageOf = (error: QuoteError) =>
    format(messages[errorMessageKey(error)] ?? '', { n: error.n ?? '' });

  const touched = new Set<string>();
  let submitted = false;

  const setFieldError = (id: string, message: string) => {
    const input = control(id);
    const box = byId<HTMLElement>(`${id}-error`);
    if (!input || !box) return;
    const text = box.querySelector('[data-error-text]');
    if (text) text.textContent = message;
    box.hidden = message === '';
    input.closest('.field')?.classList.toggle('field--error', message !== '');
    input.closest('.check')?.classList.toggle('check--error', message !== '');
    const ids = (input.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((item) => item && item !== box.id);
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      ids.push(box.id);
    } else {
      input.removeAttribute('aria-invalid');
    }
    if (ids.length > 0) input.setAttribute('aria-describedby', ids.join(' '));
    else input.removeAttribute('aria-describedby');
  };

  const fieldIds = () =>
    Array.from(form.querySelectorAll<HTMLElement>('[id]'))
      .filter((el) => el.matches('input, select, textarea') && byId(`${el.id}-error`))
      .map((el) => el.id);

  /** Pinta los errores de los campos tocados (o de todos tras un intento de envío). */
  const showErrors = (errors: QuoteError[]) => {
    const byField = new Map(errors.map((error) => [error.field, messageOf(error)]));
    for (const id of fieldIds()) {
      setFieldError(id, submitted || touched.has(id) ? (byField.get(id) ?? '') : '');
    }
  };

  const renderSummary = (errors: QuoteError[]) => {
    if (!summary) return;
    const list = summary.querySelector('[data-error-list]');
    if (list) {
      list.replaceChildren(
        ...errors.map((error) => {
          const item = document.createElement('li');
          const link = document.createElement('a');
          link.href = `#${error.field}`;
          link.textContent = messageOf(error);
          link.addEventListener('click', (event) => {
            event.preventDefault();
            control(error.field)?.focus();
          });
          item.append(link);
          return item;
        }),
      );
    }
    summary.hidden = errors.length === 0;
  };

  const turnstileBox = form.querySelector('.cf-turnstile');
  const turnstileError = byId<HTMLElement>('turnstile-error');
  const turnstileOk = () => {
    if (!turnstileBox) return true;
    const token = form.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
    const ok = Boolean(token?.value);
    if (turnstileError) turnstileError.hidden = ok;
    return ok;
  };

  const validate = () => validateQuote(read(), { today: today() });

  form.addEventListener('focusout', (event) => {
    const target = event.target as HTMLElement;
    if (!target.id || !target.matches('input, select, textarea')) return;
    touched.add(target.id);
    showErrors(validate());
  });
  // Un campo con error se re-valida mientras se corrige, para que el mensaje desaparezca al arreglarlo.
  form.addEventListener('input', (event) => {
    const target = event.target as HTMLElement;
    if (target.getAttribute('aria-invalid') === 'true' || submitted) {
      const errors = validate();
      showErrors(errors);
      if (submitted && !summary?.hidden) renderSummary(errors);
    }
  });
  form.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target === children) renderChildAges();
    if (target === rooms) syncTogether();
    if (target === checkin) syncDates();
  });

  // --- Estados ------------------------------------------------------------------------------------------------
  const roomOption = () => {
    if (!roomType || roomType.value === '') return undefined;
    return roomType.selectedOptions[0];
  };
  const summaryCtx = () => ({
    locale,
    messages,
    roomName: roomOption()?.textContent?.trim(),
  });

  const showSuccess = (input: QuoteInput) => {
    if (!success) return;
    const text = success.querySelector('[data-success-text]');
    if (text) {
      text.textContent = format(messages['success.text'] ?? '', {
        name: input.name.trim(),
        email: input.email.trim(),
      });
    }
    const list = success.querySelector('[data-success-summary]');
    list?.replaceChildren(
      ...quoteSummaryRows(input, summaryCtx()).flatMap(({ label, value: rowValue }) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = rowValue;
        return [dt, dd];
      }),
    );
    form.reset();
    (window as { turnstile?: { reset: () => void } }).turnstile?.reset();
    touched.clear();
    submitted = false;
    showErrors([]);
    renderSummary([]);
    renderChildAges();
    syncTogether();
    syncDates();
    if (failure) failure.hidden = true;
    form.hidden = true;
    success.hidden = false;
    success.focus();
  };

  const showFailure = (input: QuoteInput) => {
    if (!failure) return;
    const text = quoteSummaryText(input, { ...summaryCtx(), hotelName });
    const whatsapp = failure.querySelector<HTMLAnchorElement>('[data-fallback-whatsapp]');
    const base = data['whatsapp'];
    if (whatsapp && base) whatsapp.href = `${base}?text=${encodeURIComponent(text)}`;
    const email = failure.querySelector<HTMLAnchorElement>('[data-fallback-email]');
    const address = data['email'];
    if (email && address) {
      const subject = `${messages['mail.subject'] ?? ''} — ${hotelName}`;
      email.href = `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    }
    failure.hidden = false;
    failure.focus();
  };

  document.querySelector('[data-quote-again]')?.addEventListener('click', () => {
    if (success) success.hidden = true;
    form.hidden = false;
    checkin.focus();
  });

  // --- Envío --------------------------------------------------------------------------------------------------
  let sending = false;
  const setBusy = (busy: boolean) => {
    sending = busy;
    submit.disabled = busy;
    submit.setAttribute('aria-busy', String(busy));
    submit.textContent = (busy ? submit.dataset['labelBusy'] : submit.dataset['labelIdle']) ?? '';
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    submitted = true;
    if (failure) failure.hidden = true;

    const input = read();
    const errors = validateQuote(input, { today: today() });
    showErrors(errors);
    renderSummary(errors);
    if (errors.length > 0) {
      summary?.focus();
      return;
    }
    if (!turnstileOk()) {
      turnstileError?.focus();
      return;
    }

    // Bots: señuelo relleno o envío imposible de tan rápido. Se finge el éxito y no se manda nada.
    if ((honeypot?.value ?? '') !== '' || Date.now() - startedAt < MIN_FILL_MS) {
      showSuccess(input);
      return;
    }

    const payload = buildQuotePayload(input, {
      locale,
      roomName: roomNamesEs[input.roomType] ?? roomOption()?.textContent?.trim(),
    });

    setBusy(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let outcome: ReturnType<typeof classifyResponse> = 'failure';
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
      const body: unknown = await response.json().catch(() => null);
      outcome = classifyResponse(response.status, body);
      if (outcome === 'forbidden') {
        console.error(
          `Cotización rechazada (403): el origen ${location.origin} no está registrado como «url» del hotel en el PMS.`,
        );
      } else if (outcome === 'failure') {
        console.error(`Cotización no enviada: HTTP ${response.status}`, body);
      }
    } catch (error) {
      console.error('Cotización no enviada (red o tiempo de espera agotado):', error);
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }

    if (outcome === 'success') showSuccess(input);
    else showFailure(input);
  });

  // --- Inicio -------------------------------------------------------------------------------------------------
  const prefill = parsePrefill(new URLSearchParams(location.search), {
    today: today(),
    roomSlugs: roomType
      ? Array.from(roomType.options, (option) => option.value).filter(Boolean)
      : [],
  });
  if (prefill.roomType && roomType) roomType.value = prefill.roomType;
  if (prefill.checkin) checkin.value = prefill.checkin;
  if (prefill.checkout) checkout.value = prefill.checkout;
  renderChildAges(); // el navegador puede restaurar valores al volver atrás
  syncTogether();
  syncDates();
  submit.disabled = false; // sin JS queda deshabilitado (no se puede enviar a la API)
}

document.querySelectorAll<HTMLFormElement>('form[data-quote-form]').forEach(setup);
