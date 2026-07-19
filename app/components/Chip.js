export default function Chip({ label, on, onClick }) {
  return (
    <button
      type="button"
      className={'chip' + (on ? ' on' : '')}
      onClick={onClick}
      aria-pressed={on}
    >
      {label}
    </button>
  );
}
