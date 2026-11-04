/** La carita de Luna, la cuentacuentos. */
export function Luna({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" class="luna-avatar">
      <circle cx="32" cy="32" r="32" fill="#e6ddfa" />
      <path d="M38 12a20 20 0 1 0 16 30A16 16 0 1 1 38 12z" fill="#fff3b8" />
      <circle cx="27" cy="33" r="2.2" fill="#6b5b95" />
      <circle cx="37" cy="33" r="2.2" fill="#6b5b95" />
      <path d="M27 40q5 4 10 0" stroke="#6b5b95" stroke-width="2.2" fill="none" stroke-linecap="round" />
      <circle cx="23" cy="38" r="2.6" fill="#ffb8c6" opacity=".8" />
      <circle cx="41" cy="38" r="2.6" fill="#ffb8c6" opacity=".8" />
      <path d="M14 16l1.6 3.4 3.4 1.6-3.4 1.6L14 26l-1.6-3.4L9 21l3.4-1.6z" fill="#fff" />
    </svg>
  )
}
