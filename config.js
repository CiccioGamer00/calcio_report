// config.js
// Scegli UNO dei due blocchi (API-SPORTS diretto oppure RapidAPI) e compila la key.

// ✅ Opzione A (consigliata): API-SPORTS diretto (api-sports.io)
// Header: x-apisports-key
window.API_CONFIG = {
  provider: "apisports",
  baseUrl: "https://v3.football.api-sports.io",
  headers: {
    "x-apisports-key": "f9f0ba81f595aedb334506e478bf3bae",
  },
};

// ✅ Opzione B: RapidAPI (se la tua key è di RapidAPI)
// Header: x-rapidapi-key + x-rapidapi-host
// window.API_CONFIG = {
//   provider: "rapidapi",
//   baseUrl: "https://api-football-v1.p.rapidapi.com/v3",
//   headers: {
//     "x-rapidapi-key": "INCOLLA_QUI_LA_TUA_RAPIDAPI_KEY",
//     "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
//   },
// };