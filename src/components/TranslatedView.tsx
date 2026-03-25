import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { ScrollArea } from "./ui/scroll-area";
import { getLabels } from "../lib/translations";

interface TranslatedViewProps {
	pages: string[];
	onClose: () => void;
	language: string;
}

export function TranslatedView({ pages, onClose, language }: TranslatedViewProps) {
	const [pageNumber, setPageNumber] = useState<number>(1);
	const numPages = pages.length;

	const labels = getLabels(language);

	return (
		<div className="flex flex-col h-full bg-background border-r">
			<header className="flex items-center justify-between p-4 border-b bg-card">
				<h2 className="font-semibold tracking-tight text-foreground">{labels.translatedDoc}</h2>
				<Button variant="outline" size="sm" onClick={onClose} className="text-primary hover:text-primary">
					{labels.backToOriginal}
				</Button>
			</header>

			<ScrollArea className="flex-1 bg-muted/30">
				<div className="flex justify-center p-8 min-h-full">
					<Card className="max-w-3xl w-full min-h-[800px] shadow-sm">
						<CardContent className="p-10 text-foreground leading-relaxed whitespace-pre-wrap text-base">
							{pages[pageNumber - 1]}
						</CardContent>
					</Card>
				</div>
			</ScrollArea>

			<div className="p-3 border-t bg-card flex items-center justify-center gap-4">
				<Button variant="outline" size="icon" disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>
					<ChevronLeft size={16} />
				</Button>
				<span className="text-sm font-medium text-muted-foreground min-w-24 text-center">
					{labels.pageOf.replace("{p}", pageNumber.toString()).replace("{t}", numPages.toString())}
				</span>
				<Button variant="outline" size="icon" disabled={pageNumber >= numPages} onClick={() => setPageNumber((p) => p + 1)}>
					<ChevronRight size={16} />
				</Button>
			</div>
		</div>
	);
}
