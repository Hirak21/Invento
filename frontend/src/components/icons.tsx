interface IconProps {
  className?: string
}

function base(props: IconProps, path: React.ReactNode) {
  return (
    <svg className={props.className ?? 'w-5 h-5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      {path}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />)
}

export function CartIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h2l2.4 12.2A1 1 0 0 0 8.4 17H18a1 1 0 0 0 1-.76l3-7A1 1 0 0 0 20.24 8H6m3 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm9 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" />)
}

export function BuildingOfficeIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16m0 0h5a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-5m-9 10h5M8 7h2m-2 4h2m-2 4h2m4-8h2m-2 4h2m-2 4h2" />)
}

export function CubeTransparentIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 4 7v10l8 4 8-4V7l-8-4Zm0 0v8m0 0L4 7m8 8 8-8" />)
}

export function EllipsisHorizontalIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h.01M12 12h.01M19 12h.01" />)
}

export function ChevronDownIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />)
}

export function MagnifyingGlassIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />)
}

export function PlusIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />)
}

export function UserCircleIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />)
}

export function ArrowRightOnRectangleIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M15 3h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3" />)
}

export function XMarkIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />)
}

export function BellAlertIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.5-1.5M15 17a2 2 0 1 1-4 0m4 0H7m6 0H6.34M9 6a3 3 0 0 1 6 0c0 3 2 4 2 4H7s2-1 2-4Zm-4 4h14" />)
}

export function ClipboardListIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2m-5 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1m-6 0h6m-6 5h6m-6 4h6" />)
}

export function ReceiptIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21V3Zm3 5h6M9 12h6" />)
}

export function BanknotesIcon(props: IconProps) {
  return base(props, <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Zm6 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM6 6V5a1 1 0 0 1 1-1h11" />)
}
