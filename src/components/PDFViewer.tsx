import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, UploadCloud, Moon, Sun } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "./ui/button";
import { getLabels } from "../lib/translations";

// Set worker source
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

interface PDFViewerProps {
	file: File | string | null;
	language: string;
	onFileUpload?: (file: File) => void;
	isUploading?: boolean;
}

export function PDFViewer({ file, language, onFileUpload, isUploading }: PDFViewerProps) {
	const [numPages, setNumPages] = useState<number>(0);
	const [pageNumber, setPageNumber] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.0);
	const [isDragging, setIsDragging] = useState(false);
	const [isDark, setIsDark] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setIsDark(document.documentElement.classList.contains("dark"));
	}, []);

	const toggleTheme = () => {
		document.documentElement.classList.toggle("dark");
		setIsDark(!isDark);
	};

	const labels = getLabels(language);

	function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
		setNumPages(numPages);
		// setPageNumber(1); // Removed as per instruction
	}

	const handleDragOver = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(true);
	};

	const handleDragLeave = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
	};

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setIsDragging(false);
		if (e.dataTransfer.files && e.dataTransfer.files[0] && onFileUpload) {
			const droppedFile = e.dataTransfer.files[0];
			if (droppedFile.type === "application/pdf") {
				onFileUpload(droppedFile);
			} else {
				alert("Please drop a valid PDF file.");
			}
		}
	};

	const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files[0] && onFileUpload) {
			onFileUpload(e.target.files[0]);
		}
	};

	return (
		<div className="flex flex-col h-full bg-background border-r">
			<header className="flex items-center justify-between p-3 border-b bg-card">
				<div className="flex items-center gap-3">
					<h2 className="font-semibold tracking-tight">{labels.pdfBox}</h2>
				</div>
				<div className="flex items-center gap-2">
					<Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle Theme" className="mr-2">
						{isDark ? <Sun size={18} /> : <Moon size={18} />}
					</Button>
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
					<div 
						className={`flex flex-col items-center justify-center w-full h-full max-w-lg mx-auto rounded-3xl border-2 border-dashed transition-all duration-200 ${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-muted-foreground/20 bg-card hover:border-primary/50"}`}
						onDragOver={handleDragOver}
						onDragLeave={handleDragLeave}
						onDrop={handleDrop}
					>
						<div className="flex flex-col items-center text-center p-8 space-y-4">
							<div className={`p-4 rounded-full ${isDragging ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"} transition-colors`}>
								{isUploading ? (
									<div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
								) : (
									<UploadCloud size={40} />
								)}
							</div>
							<div className="space-y-1">
								<h3 className="text-xl font-semibold tracking-tight">
									{isUploading ? "Uploading..." : "Upload a Document"}
								</h3>
								<p className="text-sm text-muted-foreground max-w-xs mx-auto">
									{isDragging ? "Drop your PDF right here" : "Drag and drop your PDF here, or click to select a file directly."}
								</p>
							</div>
							<Button 
								onClick={() => fileInputRef.current?.click()} 
								disabled={isUploading}
								className="mt-4 rounded-full px-8"
							>
								Select PDF File
							</Button>
							<input
								type="file"
								ref={fileInputRef}
								onChange={handleFileSelect}
								accept=".pdf"
								className="hidden"
							/>
						</div>
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
