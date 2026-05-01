export function OnlineDot({ status }: { status: string }) {
  const isOnline = status === 'online';
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: isOnline ? '#07c160' : '#ccc',
        flexShrink: 0,
      }}
    />
  );
}
