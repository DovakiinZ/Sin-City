import { useTheme } from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { Monitor } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ThemeSwitcher() {
    const { theme, setTheme } = useTheme();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="ascii-box w-9 h-9">
                    <Monitor className="h-4 w-4" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="ascii-box bg-background border-ascii-border">
                <DropdownMenuItem onClick={() => setTheme("green")} className="ascii-text hover:bg-ascii-highlight hover:text-black cursor-pointer">
                    <span className="w-4 h-4 rounded-full bg-[#00ff41] mr-2 border border-white/20"></span>
                    Matrix Green
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("amber")} className="ascii-text hover:bg-ascii-highlight hover:text-black cursor-pointer">
                    <span className="w-4 h-4 rounded-full bg-[#ffb000] mr-2 border border-white/20"></span>
                    Retro Amber
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("cyan")} className="ascii-text hover:bg-ascii-highlight hover:text-black cursor-pointer">
                    <span className="w-4 h-4 rounded-full bg-[#00ffff] mr-2 border border-white/20"></span>
                    Cyber Cyan
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("c64")} className="ascii-text hover:bg-ascii-highlight hover:text-black cursor-pointer">
                    <span className="w-4 h-4 rounded-full bg-[#9d9dff] mr-2 border border-white/20"></span>
                    C64 Blue
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("purple")} className="ascii-text hover:bg-ascii-highlight hover:text-black cursor-pointer">
                    <span className="w-4 h-4 rounded-full bg-[#c77dff] mr-2 border border-white/20"></span>
                    Terminal Purple
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
