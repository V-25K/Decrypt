type IconProps = {
  className?: string | undefined;
};

type StrokeIconProps = IconProps & {
  viewBox?: string;
  strokeWidth?: number;
  children: React.ReactNode;
};

const StrokeIcon = ({
  className,
  viewBox = '0 0 24 24',
  strokeWidth = 1.9,
  children,
}: StrokeIconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const RedditTokenIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    className={props.className}
    aria-hidden="true"
  >
    <path d="m17.08 4.953-4.073-2.958a5.118 5.118 0 0 0-6.018 0L2.917 4.953a5.12 5.12 0 0 0-1.86 5.723l1.555 4.786A5.12 5.12 0 0 0 7.482 19h5.032a5.12 5.12 0 0 0 4.87-3.537l1.554-4.786a5.117 5.117 0 0 0-1.859-5.723ZM14.31 9.765l-1.277 3.928a1.022 1.022 0 0 1-.972.706h-4.13c-.443 0-.835-.285-.972-.706L5.683 9.765a1.023 1.023 0 0 1 .371-1.143l3.342-2.427c.358-.26.843-.26 1.201 0l3.342 2.427c.358.26.51.722.372 1.143Z" />
  </svg>
);

export const HomeIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M4.75 10.5 12 4.75l7.25 5.75" />
    <path d="M6.5 9.75V19h11V9.75" />
    <path d="M10 19v-4.75h4V19" />
    <path d="M9.25 10.75h5.5" />
  </StrokeIcon>
);

export const InfoIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10.5v6" />
    <path d="M12 7.5h.01" />
  </StrokeIcon>
);

export const SettingsIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <circle cx="12" cy="12" r="3.25" />
    <path d="M12 3.75v2.15" />
    <path d="M12 18.1v2.15" />
    <path d="M3.75 12h2.15" />
    <path d="M18.1 12h2.15" />
    <path d="m6.15 6.15 1.52 1.52" />
    <path d="m16.33 16.33 1.52 1.52" />
    <path d="m17.85 6.15-1.52 1.52" />
    <path d="m7.67 16.33-1.52 1.52" />
  </StrokeIcon>
);

export const ShopIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M7.5 7.25V6a2.75 2.75 0 0 1 2.75-2.75h3.5A2.75 2.75 0 0 1 16.5 6v1.25" />
    <path d="M4.5 8.25h15V18a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V8.25Z" />
    <path d="M4.5 11.25h15" />
    <path d="M10.25 14.25h3.5" />
  </StrokeIcon>
);

export const QuestIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M7 4.25h6l3 3V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.25a2 2 0 0 1 2-2Z" />
    <path d="M13 4.25v3h3" />
    <path d="m8.5 13 2 2 5-5" />
  </StrokeIcon>
);

export const StatsIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M5 19.25h14" />
    <path d="M8 17v-4" />
    <path d="M12 17V9.5" />
    <path d="M16 17v-6.5" />
    <path d="m6.5 11.5 3.5-2.75 3 2 4-4.25" />
  </StrokeIcon>
);

export const LeaderboardIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M7 4.75h10v2.5A5 5 0 0 1 12 12.25 5 5 0 0 1 7 7.25v-2.5Z" />
    <path d="M7 6.25H5.75A1.75 1.75 0 0 0 4 8a1.75 1.75 0 0 0 1.75 1.75H7" />
    <path d="M17 6.25h1.25A1.75 1.75 0 0 1 20 8a1.75 1.75 0 0 1-1.75 1.75H17" />
    <path d="M12 12.25V16" />
    <path d="M9 19.25h6" />
    <path d="M10.25 15.75h3.5" />
  </StrokeIcon>
);

export const SoundIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M5 9h3.5L13 5.5v13l-4.5-3.5H5V9Z" />
    <path d="M16 9.25a3.5 3.5 0 0 1 0 5.5" />
    <path d="M18 7a6.5 6.5 0 0 1 0 10" />
  </StrokeIcon>
);

export const ShareIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="m14 14 6-5-6-5" />
    <path d="M20 9h-8a8 8 0 0 0-8 8v3" />
  </StrokeIcon>
);

export const ReplayIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <path d="M3 12a9 9 0 1 0 3.2-6.9" />
    <path d="M3 4v5h5" />
  </StrokeIcon>
);
