# Geolumen 🌊

**England's river health, made visible.**

Geolumen is an interactive web app that makes Environment Agency water quality 
data accessible to everyone. Explore over 65,000 sampling points across every 
river, lake, and estuary in England — with decades of measurements visualised 
as interactive time series charts.

---

## Features

- 🗺️ **Interactive map** — Browse all sampling locations with clustered markers 
  powered by Leaflet
- 📈 **Time series charts** — View historical measurements for ammonia, 
  phosphates, dissolved oxygen, temperature, and more
- ✅ **Water quality thresholds** — See how readings compare against official 
  EA standards at a glance
- 📱 **Responsive design** — Works across desktop and mobile

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, React Router, Vite |
| Mapping | Leaflet + react-leaflet |
| Charts | Recharts |
| Styling | Tailwind CSS v4 |
| Data | Environment Agency Water Quality API |

---

## Getting started
```bash
npm install
npm run dev
```

The dev server proxies all API requests to the Environment Agency's open data 
API — no keys or account required.

---

## Roadmap

- [ ] River-level health summaries
- [ ] Upstream/downstream issue tracing
- [ ] Storm overflow event data
- [ ] Fish population data integration

---

## Contributing

Contributions, issues and feature requests are welcome. This project is in 
active development — if you work in environmental monitoring, water quality, 
or open data and have ideas, please get in touch.

---

## Built by

**Laurence Wayne** — [hello@laurence-wayne.com](mailto:hello@laurence-wayne.com)

---

## License

Open-source and free to use under the [MIT License](LICENSE).  
Water quality data provided by the [Environment Agency](https://environment.data.gov.uk/water-quality/view/landing) 
under the Open Government Licence.