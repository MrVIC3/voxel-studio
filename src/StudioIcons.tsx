type Props = { size?: number; strokeWidth?: number; className?: string };
function Glyph({
  children,
  size = 16,
  strokeWidth = 1.3,
  className,
}: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}
export const MeshIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="m3 12 5-9 5 9H3Zm0 0 5-4 5 4M8 3v5" />
    <circle cx="8" cy="3" r="1.2" fill="currentColor" />
    <circle cx="3" cy="12" r="1.2" fill="currentColor" />
    <circle cx="13" cy="12" r="1.2" fill="currentColor" />
  </Glyph>
);
export const ArmatureIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="m5 12 3-5 4-4M8 7l4 4M8 7 4 4" />
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="3" r="1.6" />
    <circle cx="12" cy="11" r="1.6" />
    <circle cx="4" cy="4" r="1.2" />
  </Glyph>
);
export const BoneIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="m5 11 6-6m-8 7 2 1 2-2-2-2-2 1v2Zm6-8 2 2 2-2-1-2h-2L9 4Z" />
  </Glyph>
);
export const CameraGlyph = (p: Props) => (
  <Glyph {...p}>
    <path d="M2 5h8v7H2V5Zm8 2 4-3v9l-4-3M4 5l1-2h4l1 2" />
  </Glyph>
);
export const LightIcon = (p: Props) => (
  <Glyph {...p}>
    <circle cx="8" cy="8" r="2.7" />
    <path d="M8 1v2m0 10v2M1 8h2m10 0h2M3 3l1.5 1.5m7 7L13 13M3 13l1.5-1.5m7-7L13 3" />
  </Glyph>
);
export const MoveIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="M8 14V2m0 0L5 5m3-3 3 3M2 9h12m0 0-3-3m3 3-3 3" />
  </Glyph>
);
export const RotateIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="M13 6A5.5 5.5 0 1 0 13 11M13 2v4H9" />
  </Glyph>
);
export const ScaleIcon = (p: Props) => (
  <Glyph {...p}>
    <path d="M2 9h5v5H2V9Zm5 0 7-7M9 2h5v5" />
  </Glyph>
);
