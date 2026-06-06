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

export const InfoIcon = (props: IconProps) => (
  <StrokeIcon className={props.className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 10.5v6" />
    <path d="M12 7.5h.01" />
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
