/**
 * Textos de interfaz fijos (menú, botones, etiquetas). El contenido del hotel (nombres, descripciones, políticas)
 * viene del PMS y NO va aquí. El tipo obliga a que `en` tenga exactamente las mismas claves que `es`.
 */
import type { Locale } from '../../clients/types.ts';

const es = {
  'skip.main': 'Saltar al contenido',
  'nav.main': 'Navegación principal',
  'nav.home': 'Inicio',
  'nav.rooms': 'Habitaciones',
  'nav.gallery': 'Galería',
  'nav.location': 'Ubicación',
  'nav.contact': 'Contacto',
  'nav.menu': 'Menú',
  'nav.menu.close': 'Cerrar menú',
  'nav.breadcrumb': 'Ruta de navegación',
  'lang.switch': 'Cambiar idioma',
  'lang.es': 'Español',
  'lang.en': 'English',
  'cta.quote': 'Cotizar',
  'cta.quote.long': 'Solicitar cotización',
  'footer.policies': 'Políticas y privacidad',
  'footer.rights': 'Todos los derechos reservados',
  'footer.contact': 'Contacto',
  'footer.explore': 'Explorar',
  'gallery.open': 'Ampliar foto',
  'gallery.close': 'Cerrar',
  'gallery.prev': 'Foto anterior',
  'gallery.next': 'Foto siguiente',
  'gallery.position': 'Foto {current} de {total}',
  'image.unavailable': 'Imagen no disponible',
  'form.required': 'obligatorio',
  'form.error.title': 'Hay un problema con el formulario',
  'common.credit': 'Foto',
} as const;

export type UiKey = keyof typeof es;

const en: Record<UiKey, string> = {
  'skip.main': 'Skip to content',
  'nav.main': 'Main navigation',
  'nav.home': 'Home',
  'nav.rooms': 'Rooms',
  'nav.gallery': 'Gallery',
  'nav.location': 'Location',
  'nav.contact': 'Contact',
  'nav.menu': 'Menu',
  'nav.menu.close': 'Close menu',
  'nav.breadcrumb': 'Breadcrumb',
  'lang.switch': 'Change language',
  'lang.es': 'Español',
  'lang.en': 'English',
  'cta.quote': 'Get a quote',
  'cta.quote.long': 'Request a quote',
  'footer.policies': 'Policies and privacy',
  'footer.rights': 'All rights reserved',
  'footer.contact': 'Contact',
  'footer.explore': 'Explore',
  'gallery.open': 'Enlarge photo',
  'gallery.close': 'Close',
  'gallery.prev': 'Previous photo',
  'gallery.next': 'Next photo',
  'gallery.position': 'Photo {current} of {total}',
  'image.unavailable': 'Image unavailable',
  'form.required': 'required',
  'form.error.title': 'There is a problem with the form',
  'common.credit': 'Photo',
};

export const ui: Record<Locale, Record<UiKey, string>> = { es, en };

export function t(
  locale: Locale,
  key: UiKey,
  params: Record<string, string | number> = {},
): string {
  const template = ui[locale][key];
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
