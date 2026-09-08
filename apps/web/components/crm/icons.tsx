/**
 * Iconos del CRM.
 *
 * Reemplazan a los emojis que usaba la barra heredada de la extensión: un emoji
 * se ve distinto en cada sistema operativo, no se puede recolorear y no acompaña
 * el peso tipográfico del resto. Todos comparten grilla de 24, trazo 1.8 y
 * `currentColor`, así que heredan el color del botón que los contiene.
 */
type IconProps = { size?: number; className?: string };

function Svg({ size = 15, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const IconSparkle = (props: IconProps) => (
  <Svg {...props}><path d="M12 3l1.8 4.9L18.7 9.7l-4.9 1.8L12 16.4l-1.8-4.9L5.3 9.7l4.9-1.8z" /></Svg>
);

export const IconPlus = (props: IconProps) => (
  <Svg {...props}><path d="M12 5v14M5 12h14" /></Svg>
);

export const IconDocument = (props: IconProps) => (
  <Svg {...props}><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h5" /></Svg>
);

export const IconCart = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 5h2l2.2 9.5h9.1L19 8H7" />
    <circle cx="10" cy="19" r="1.3" />
    <circle cx="17" cy="19" r="1.3" />
  </Svg>
);

export const IconGlobe = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5z" />
  </Svg>
);

export const IconBell = (props: IconProps) => (
  <Svg {...props}><path d="M18 15V10a6 6 0 10-12 0v5l-1.6 2.5h15.2z" /><path d="M10 20h4" /></Svg>
);

export const IconGear = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1v.3a2 2 0 11-4 0v-.2a1.6 1.6 0 00-2.8-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003.6 15a2 2 0 01-1.6-1.9v-.2a2 2 0 011.9-2 1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V4a2 2 0 114 0v.2a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.2a2 2 0 010 4h-.2a1.6 1.6 0 00-1.4 1.2z" />
  </Svg>
);

export const IconSend = (props: IconProps) => (
  <Svg {...props}><path d="M20 4L3.5 10.5l6.5 2.5 2.5 6.5z" /></Svg>
);

export const IconSearch = (props: IconProps) => (
  <Svg {...props}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>
);

export const IconLock = (props: IconProps) => (
  <Svg {...props}><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 018 0" /></Svg>
);

export const IconClock = (props: IconProps) => (
  <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
);

export const IconCheck = (props: IconProps) => (
  <Svg {...props}><path d="M5 13l4 4L19 7" /></Svg>
);

export const IconPencil = (props: IconProps) => (
  <Svg {...props}><path d="M4 20l4.5-1 10-10a2.1 2.1 0 10-3-3l-10 10z" /></Svg>
);

export const IconExternal = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 4h6v6" /><path d="M20 4l-8.5 8.5" />
    <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
  </Svg>
);

export const IconClose = (props: IconProps) => (
  <Svg {...props}><path d="M18 6L6 18M6 6l12 12" /></Svg>
);

export const IconChevronDown = (props: IconProps) => (
  <Svg {...props}><path d="M6 9l6 6 6-6" /></Svg>
);

export const IconDots = (props: IconProps) => (
  <svg width={props.size ?? 15} height={props.size ?? 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
  </svg>
);

export const IconTrash = (props: IconProps) => (
  <Svg {...props}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /></Svg>
);

export const IconChat = (props: IconProps) => (
  <Svg {...props}><path d="M21 11.5a8.4 8.4 0 01-11.9 7.6L3 21l1.9-5.6A8.4 8.4 0 1121 11.5z" /></Svg>
);

export const IconInfo = (props: IconProps) => (
  <Svg {...props}><circle cx="12" cy="12" r="8.5" /><path d="M12 8v5M12 16h.01" /></Svg>
);
