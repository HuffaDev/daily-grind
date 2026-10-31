import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";
import LaunchLink from "@/platform/components/LaunchLink";
import { linkHover } from "./ui";

interface Props {
  /** Such as "2 of 5". Empty once the game is over. */
  progress: string;
  /** Top right, such as a help button. */
  action?: ReactNode;
}

/** The same top row in every round game. Three equal columns keep the progress truly centred. */
export default function GameHeader({ progress, action }: Props) {
  return (
    <div className="grid grid-cols-3 items-center text-sm">
      <LaunchLink href="/" className={`${linkHover} pointer-events-auto inline-flex min-h-8 items-center gap-1 justify-self-start text-[#ece7dc]/75`}>
        <ArrowLeft className="size-4" aria-hidden />
        Daily Grind
      </LaunchLink>
      <span className="justify-self-center font-medium tabular-nums text-[#ece7dc]/85">
        {progress}
      </span>
      <span className="flex items-center gap-2 justify-self-end">{action}</span>
    </div>
  );
}
