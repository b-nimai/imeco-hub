import { useEffect, useState } from 'react';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Seconds-precision wall clock for the billing TV header. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="text-right">
      <div className="text-xl font-bold tracking-tight text-white tabular-nums">
        {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}{' '}
        <span className="text-sm font-semibold text-[#22c55e]">IST</span>
      </div>
      <div className="mt-0.5 text-[13px] font-medium text-[#94a3b8]">
        {DAYS[now.getDay()]}, {now.getDate()} {MONTHS[now.getMonth()]} {now.getFullYear()}
      </div>
    </div>
  );
}
