import { defineClient } from './types.ts';

/** Hotel La Cabaña de Puerto Ángel. Valores de desarrollo: API de dev y origen `http://localhost:4202`. */
export default defineClient({
  slug: 'lacabana',
  hotelId: '5fe1ffca46f0600fec51463d',
  origin: 'http://localhost:4202',
  apiBaseUrl: 'https://apihotel-dev.spinoff.website',
  defaultLocale: 'es',
  locales: ['es', 'en'],
  timeZone: 'America/Mexico_City',
  checkInTime: '15:00',
  checkOutTime: '12:00',
  // Aproximado: centro de Puerto Ángel, Oaxaca. Reemplazar por la ubicación exacta del hotel.
  coordinates: { lat: 15.6694, lng: -96.4906 },
  contact: {},
  // Los tokens de marca se definen en el playbook 03.
  theme: {},
});
