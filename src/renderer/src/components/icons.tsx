// Small inline stroke icons (16px, currentColor) so we don't pull in an icon library yet.
type IconProps = { className?: string }

function Icon({ d, className = 'size-4' }: IconProps & { d: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

export const NewChatIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
)
export const FolderIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
)
export const PlusIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 5v14M5 12h14" />
export const XIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M6 6l12 12M18 6L6 18" />
export const TrashIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
)
export const ChevronDownIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M6 9l6 6 6-6" />
export const ArrowUpIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 19V5M5 12l7-7 7 7" />
export const StopIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M7 7h10v10H7z" />
export const CheckIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M5 12l5 5L20 7" />
export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <Icon
    {...p}
    d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
  />
)
export const DownloadIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 4v12M6 10l6 6 6-6M4 20h16" />
export const ArrowLeftIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M19 12H5M12 19l-7-7 7-7" />
