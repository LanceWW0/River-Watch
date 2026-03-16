# EA Water Quality — Pre-processing Pipeline

Fetches data from the Environment Agency Water Quality API and produces
optimised static JSON files for fast client-side loading.

## Setup

```bash
cd pipeline
npm install
```

## Usage

### Step 1: Fetch sampling points

```bash
npm run fetch:points
```

This paginates through all ~65,000 EA sampling points, converts BNG
coordinates to WGS84, and writes `data/points.geojson`.

**Runtime:** ~5-10 minutes  
**Output:** ~8-10MB raw (~2-3MB gzipped)

### Step 2: Fetch observations

```bash
# All points (will take a LONG time for all 65K — hours/days)
npm run fetch:observations

# Only active sampling points (recommended first run)
npm run fetch:observations:active

# Test with a small sample first
npm run fetch:observations:sample

# Custom options
node fetch-observations.mjs --concurrency 2 --limit 500 --filter active
```

**The observations script is resumable** — it skips points that already
have an output file. If it crashes or you stop it, just run it again and
it picks up where it left off. Use `--force` to re-fetch everything.

Each point writes to `data/observations/{notation}.json`.

### CLI options for fetch-observations

| Flag              | Default | Description                                |
|-------------------|---------|--------------------------------------------|
| `--concurrency N` | 4       | Number of points to fetch in parallel      |
| `--limit N`       | all     | Only process the first N points            |
| `--filter text`   | none    | Only process points whose status contains text |
| `--force`         | false   | Re-fetch even if output file already exists |

## Output structure

```
data/
├── points.geojson              # All sampling points as GeoJSON
└── observations/
    ├── AN-CORBY.json           # Observations grouped by determinand
    ├── AN-TYNE01.json
    └── ...
```

### points.geojson

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-1.6178, 54.9783] },
      "properties": {
        "n": "AN-TYNE01",
        "l": "RIVER TYNE AT NEWBURN",
        "s": "active",
        "t": "river",
        "a": "North East"
      }
    }
  ]
}
```

Properties use short keys to reduce file size:
- `n` = notation (unique ID)
- `l` = label (display name)
- `s` = status (active/closed)
- `t` = type (river/lake/coastal/groundwater)
- `a` = area/region

### observations/{notation}.json

```json
{
  "notation": "AN-TYNE01",
  "fetchedAt": "2025-01-15T10:30:00.000Z",
  "totalObservations": 3200,
  "determinands": [
    {
      "determinand": "0076",
      "label": "Ammonia",
      "unit": "mg/l",
      "readings": [
        { "d": "2020-01-15T09:00:00", "v": 0.12 },
        { "d": "2020-02-10T10:30:00", "v": 0.15 }
      ]
    }
  ]
}
```

## Integrating with your Vite app

Copy or symlink the `data/` directory into your app's `public/` folder:

```bash
# Option 1: Copy
cp -r data/ ../your-app/public/data/

# Option 2: Symlink
ln -s $(pwd)/data ../your-app/public/data
```

Then in your app, fetch from `/data/points.geojson` and
`/data/observations/{notation}.json` instead of the live EA API.

## Hosting options

- **Local dev:** Drop into `public/data/` and Vite serves it statically
- **S3 / Cloudflare R2:** Upload with gzip encoding, serve via CDN
- **GitHub Actions:** Run on a weekly schedule, commit to a data branch or upload to R2

## Tips

- Run `fetch:observations:sample` first to verify everything works
- For production, consider only fetching active points (`--filter active`)
  as closed points rarely get new data
- Enable gzip/brotli compression on your server — the JSON files compress
  extremely well (typically 70-80% reduction)