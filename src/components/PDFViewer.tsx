import { ChevronLeft, ChevronRight, Menu, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "./ui/button";
import { getLabels } from "../lib/translations";

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface PDFViewerProps {
	file: File | string | null;
	onOpenSidebar: () => void;
	language: string;
}

export function PDFViewer({ file, onOpenSidebar, language }: PDFViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.0);

	const labels = getLabels(language);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		// setPageNumber(1); // Removed as per instruction
	}

	return (
		<div className="flex flex-col h-full bg-background border-r">
			<header className="flex items-center justify-between p-3 border-b bg-card">
				<div className="flex items-center gap-3">
					<Button variant="ghost" size="icon" onClick={onOpenSidebar} title="Open Menu">
						<Menu size={20} />
					</Button>
					<h2 className="font-semibold tracking-tight">{labels.pdfBox}</h2>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="outline" size="icon" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} title="Zoom Out">
						<ZoomOut size={16} />
					</Button>
					<span className="text-sm font-medium w-12 text-center text-muted-foreground">{Math.round(scale * 100)}%</span>
					<Button variant="outline" size="icon" onClick={() => setScale((s) => Math.min(2.0, s + 0.1))} title="Zoom In">
						<ZoomIn size={16} />
					</Button>
				</div>
			</header>

			<div className="flex-1 overflow-auto p-4 flex justify-center bg-muted/30">
				{file ? (
					<div className="shadow-lg border bg-card/50 overflow-hidden">
						<Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
							<Page pageNumber={pageNumber} scale={scale} renderTextLayer={true} renderAnnotationLayer={true} />
						</Document>
					</div>
				) : (
					<div className="flex flex-col items-center justify-center h-full text-muted-foreground">
						<p>{labels.noPdf}</p>
					</div>
				)}
			</div>

			{file && numPages > 0 && (
				<div className="p-3 border-t bg-card flex items-center justify-center gap-4">
					<Button variant="outline" size="icon" disabled={pageNumber <= 1} onClick={() => setPageNumber((p) => p - 1)}>
						<ChevronLeft size={16} />
					</Button>
					<span className="text-sm font-medium text-muted-foreground">
						{labels.pageOf.replace("{p}", pageNumber.toString()).replace("{t}", numPages.toString())}
					</span>
					<Button variant="outline" size="icon" disabled={pageNumber >= numPages} onClick={() => setPageNumber((p) => p + 1)}>
						<ChevronRight size={16} />
					</Button>
				</div>
			)}
		</div>
	);
}
