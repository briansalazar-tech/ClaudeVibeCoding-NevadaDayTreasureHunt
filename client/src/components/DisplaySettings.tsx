import { useHuntStore, type LabelSize, type Theme } from '../state/store';
import { Segmented } from './Segmented';

const LABEL_SIZES: { value: LabelSize; label: string }[] = [
  { value: 'S', label: 'S' },
  { value: 'M', label: 'M' },
  { value: 'L', label: 'L' },
  { value: 'XL', label: 'XL' },
];

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function DisplaySettings() {
  const labelSize = useHuntStore((s) => s.labelSize);
  const theme = useHuntStore((s) => s.theme);
  const setLabelSize = useHuntStore((s) => s.setLabelSize);
  const setTheme = useHuntStore((s) => s.setTheme);
  return (
    <section className="panel-section display-settings" aria-labelledby="display-heading">
      <h2 id="display-heading">Display</h2>
      <Segmented
        legend="Label size"
        name="label-size"
        options={LABEL_SIZES}
        value={labelSize}
        onChange={setLabelSize}
      />
      <Segmented legend="Theme" name="theme" options={THEMES} value={theme} onChange={setTheme} />
    </section>
  );
}
