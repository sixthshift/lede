// JD paste input — spec.md §13, §15 (disabled while pending).

type JDInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
};

export function JDInput({ value, onChange, onSubmit, pending }: JDInputProps) {
  return (
    <div className="jd-input">
      <textarea
        className="jd-input__textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={pending}
        placeholder="Paste the job description here…"
        rows={12}
      />
      <button
        type="button"
        className="jd-input__submit"
        onClick={onSubmit}
        disabled={pending || value.trim().length === 0}
      >
        {pending ? "Tailoring…" : "Tailor"}
      </button>
    </div>
  );
}
