import weatherUi from '../lib/weather.js';

// Compact weather pill for one park over one stay: "☀️ 82°/61° 💧40%".
// Within the 16-day window shows the forecast; beyond it falls back to
// climatological normals ("~78°/59° typical", dashed) so far-out stays still
// tell you what to expect. Renders nothing when neither is available.
export default function WeatherBadge({ days, normals, arrival, nights }) {
  const wx = weatherUi.stayForecast(days, arrival, nights);
  if (wx) {
    const info = weatherUi.codeInfo(wx.code);
    return (
      <span
        className="wx-badge"
        title={`${info.label} during the stay · high ${wx.hi}°F / low ${wx.lo}°F · ${wx.precip}% chance of precipitation (Open-Meteo forecast)`}
      >
        <span aria-hidden="true">{info.icon}</span>
        <span className="wx-temps">
          {wx.hi}°<span className="wx-lo">/{wx.lo}°</span>
        </span>
        {wx.precip >= 30 ? <span className="wx-precip">💧{wx.precip}%</span> : null}
      </span>
    );
  }

  const ty = weatherUi.typicalForStay(normals, arrival, nights);
  if (!ty) return null;
  return (
    <span
      className="wx-badge wx-typical"
      title={`Too far out for a forecast — typical weather for these dates (3-year average, Open-Meteo) · high ~${ty.hi}°F / low ~${ty.lo}°F · rain on ${ty.wet}% of days`}
    >
      <span aria-hidden="true">🌡️</span>
      <span className="wx-temps">
        ~{ty.hi}°<span className="wx-lo">/{ty.lo}°</span>
      </span>
      {ty.wet >= 30 ? <span className="wx-precip">💧{ty.wet}%</span> : null}
      <span className="wx-tag">typical</span>
    </span>
  );
}

