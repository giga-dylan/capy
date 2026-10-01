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
export const ShieldIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6z" />
export const SideChatIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M3 5h11v9H7l-4 3zM14 9h7v9l-3-2h-6v-2" />
// Brain and gauge paths adapted from Lucide (lucide.dev, ISC license).
export const BrainIcon = (p: IconProps): React.JSX.Element => (
  <Icon
    {...p}
    d="M12 5a3 3 0 1 0-6 .1 4 4 0 0 0-2.5 5.8 4 4 0 0 0 .6 6.6A4 4 0 1 0 12 18zM12 5a3 3 0 1 1 6 .1 4 4 0 0 1 2.5 5.8 4 4 0 0 1-.6 6.6A4 4 0 1 1 12 18zM15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4M12 5v13"
  />
)
export const GaugeIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 14l4-4M3.3 19a10 10 0 1 1 17.4 0" />
// Paths below adapted from Lucide (lucide.dev, ISC license).
export const PaperclipIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
)
export const DiffIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 3v14M5 10h14M5 21h14" />
export const FilesIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7zM14 2v5h5M9 13h6M9 17h4" />
export const TerminalIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M4 17l6-6-6-6M12 19h8" />
export const BranchIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9" />
export const UndoIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M3 7v6h6M21 17a9 9 0 0 0-15-6.7L3 13" />
export const RedoIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M21 7v6h-6M3 17a9 9 0 0 1 15-6.7L21 13" />
export const PencilIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
export const AgentsIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M12 8V4H8M4 12a8 8 0 0 1 8-8M2 14h2M20 14h2M15 13v2M9 13v2M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z" />
)
export const SearchIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" />
export const CircleIcon = (p: IconProps): React.JSX.Element => <Icon {...p} d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
export const CopyIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p} d="M8 8h12v12H8zM16 8V4H4v12h4" />
)
