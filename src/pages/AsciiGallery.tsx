import { useState } from "react";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import ImageToAsciiConverter from "@/components/ImageToAsciiConverter";

const asciiArtCollection = [
    {
        title: "City Skyline",
        art: `
     .   .     .  .      .
   . .  .  .   .    .   .
 .  .  .  .  .  .  .  .
_|__|__|__|__|__|__|__|_
|  |  |  |  |  |  |  |  |
|__|__|__|__|__|__|__|__|
|  |  |  |  |  |  |  |  |
|__|__|__|__|__|__|__|__|
    `
    },
    {
        title: "Coffee",
        art: `
    ( (
     ) )
  ........
  |      |]
  \\      /
   \`----'
    `
    },
    {
        title: "Computer",
        art: `
   ._________________.
   |.---------------.|
   ||               ||
   ||   >_          ||
   ||               ||
   ||_______________||
   /.-.-.-.-.-.-.-.-.\\
  /.-.-.-.-.-.-.-.-.-.\\
 /_____________________\\
 \\_____________________/
    `
    },
    {
        title: "Ghost",
        art: `
     .-.
   .'   '.
   : g g :
   :  o  :
    '._.'
    `
    },
    {
        title: "Dragon",
        art: `
                \\||/
                |  @___oo
      /\\  /\\   / (__,,,,|
     ) /^\\) ^\\/ _)
     )   /^\\/   _)
     )   _ /  / _)
 /\\  )/\\/ ||  | )_)
<  >      |(,,) )__)
 ||      /    \\)___)\\
 | \\____(      )___) )___
 \\______(_______;;; __;;;
    `
    }
];

export default function AsciiGallery() {
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

    const copyToClipboard = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex justify-between items-center">
                    <BackButton />
                    <h1 className="ascii-highlight text-xl">ASCII Art Gallery</h1>
                </div>

                {/* Image to ASCII Converter temporarily disabled due to quality issues */}
                {/* <ImageToAsciiConverter /> */}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {asciiArtCollection.map((item, index) => (
                        <div key={index} className="ascii-box p-6 relative group">
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => copyToClipboard(item.art, index)}
                                    className="h-8 w-8 hover:bg-ascii-highlight hover:text-black"
                                >
                                    {copiedIndex === index ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                            <pre className="ascii-highlight text-xs mb-4 text-center">{item.title}</pre>
                            <pre className="text-xs leading-none font-mono whitespace-pre overflow-x-auto flex justify-center">
                                {item.art}
                            </pre>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
