// A template (unlike a layout) remounts on every navigation, so its entrance animation
// replays each time the page changes while the header in the layout stays put.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter flex flex-1 flex-col">{children}</div>;
}
