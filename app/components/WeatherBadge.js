import weatherUi from '../lib/weather.js';

// Compact forecast pill for one park over one stay: "☀️ 82°/61° 💧40%".
// Renders nothing when the stay is beyond the 16-day forecast window.
export default function WeatherBadge({ days, arrival, nights }) {
  const wx = weatherUi.stayForecast(days, arrival, nights);
  if (!wx) return null;
  const info = weatherUi.codeInfo(wx.code);
  return (
    <span
      className="wx-badge"
      title={`${info.label} during the stay · high ${wx.hi}°F / low ${wx.lo}°F · ${wx.precip}% chance of precipitation (Open-Meteo)`}
    >
      <span aria-hidden="true">{info.icon}</span>
      <span className="wx-temps">
        {wx.hi}°<span className="wx-lo">/{wx.lo}°</span>
      </span>
      {wx.precip >= 30 ? <span className="wx-precip">💧{wx.precip}%</span> : null}
    </span>
  );
}
