interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string> {
  legend: string;
  name: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A row of radio buttons styled as a segmented control. */
export function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  className = '',
}: SegmentedProps<T>) {
  return (
    <fieldset className={`segmented ${className}`}>
      <legend>{legend}</legend>
      <div className="segmented-options">
        {options.map((o) => (
          <label key={o.value}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
