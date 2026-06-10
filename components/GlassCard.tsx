import { cn } from "@/lib/cn";

export function GlassCard({
  children, className, ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("glass p-6", className)} {...rest}>
      {children}
    </div>
  );
}
