// config.js
// Scegli UNO dei due blocchi (API-SPORTS diretto oppure RapidAPI) e compila la key.

// ✅ Opzione A (consigliata): API-SPORTS diretto (api-sports.io)
// Header: x-apisports-key
// config.js
window.API_CONFIG = {
  baseUrl: "https://calcio-report-proxy.stemoro84.workers.dev",
  headers: {
    // se il Worker aggiunge lui la key, qui puoi anche lasciare vuoto
    // altrimenti puoi ancora passare l'header dal client (ma sconsiglio)
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