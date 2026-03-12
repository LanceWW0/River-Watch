import { useEffect } from "react";

function App() {
  useEffect(() => {
    fetch(
      "/api/ea/water-quality/sampling-point?skip=0&limit=10&latitude=52.5&longitude=-0.1&radius=40",
      {
        headers: {
          accept: "application/ld+json",
          "API-Version": "1",
        },
      },
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => console.log(data))
      .catch((err) => console.error("Error:", err));
  }, []);

  return (
    <div>
      <h1>Aquavera</h1>
      <p>Check the browser console for API data...</p>
    </div>
  );
}

export default App;
