import { useEffect, useState } from "react";

import { ChatInterface } from "./components/ChatInterface";
import { PDFViewer } from "./components/PDFViewer";
import { TranslatedView } from "./components/TranslatedView";
import { LANGUAGES } from "./lib/translations";

function App() {
	const [pdfFile, setPdfFile] = useState<File | string | null>(null);
	const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [translatedPages, setTranslatedPages] = useState<string[] | null>(null);

	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [language, setLanguage] = useState("english");

	useEffect(() => {
		const newSessionId = crypto.randomUUID();
		setCurrentSessionId(newSessionId);

		const cleanupSession = () => {
			fetch('http://localhost:8888/api/cleanup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId: newSessionId }),
				keepalive: true
			}).catch(err => console.error("Cleanup error:", err));
		};

		window.addEventListener('beforeunload', cleanupSession);

		return () => {
			window.removeEventListener('beforeunload', cleanupSession);
			cleanupSession();
		};
	}, []);

	const handleFileUpload = async (file: File) => {
		setIsUploading(true);
		const formData = new FormData();
		formData.append("pdf", file);
		if (currentSessionId) {
			formData.append("sessionId", currentSessionId);
		}

		try {
			const response = await fetch("http://localhost:8888/api/upload", {
				method: "POST",
				body: formData,
			});

			if (response.ok) {
				const data = await response.json();
				setPdfFile(file);
				setUploadedFilename(data.filename);
				setTranslatedPages(null);
			} else {
				console.error("Upload failed");
				alert("Upload failed. Please try again.");
			}
		} catch (error) {
			console.error("Upload error:", error);
			alert("Upload error. See console.");
		} finally {
			setIsUploading(false);
		}
	};

	const handleTranslationRequest = async (message: string) => {
		const lowerMsg = message.toLowerCase();
		if (lowerMsg.includes("translate") && uploadedFilename && currentSessionId) {
			const languageCodes = LANGUAGES.map(l => l.code).filter(c => c !== "english");
			const targetLang = languageCodes.find((l) => lowerMsg.includes(l));

			if (targetLang) {
				try {
					const res = await fetch("http://localhost:8888/api/translate_document", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({ language: targetLang, filename: uploadedFilename })
					});
					if (res.ok) {
						const data = await res.json();
						setTranslatedPages(data.pages);
					}
				} catch (err) {
					console.error("Translation document error:", err);
				}
			}
		}
	};



	return (
		<div className="flex flex-col lg:flex-row h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
			{/* Left Side: PDFBox */}
			<div className="w-full h-1/2 lg:w-1/2 lg:h-full bg-card overflow-hidden">
				{translatedPages ? (
					<TranslatedView pages={translatedPages} onClose={() => setTranslatedPages(null)} language={language} />
				) : (
					<PDFViewer 
						file={pdfFile} 
						language={language} 
						onFileUpload={handleFileUpload}
						isUploading={isUploading}
					/>
				)}
			</div>

			{/* Right Side: Chat Interface */}
			<div className="w-full h-1/2 lg:w-1/2 lg:h-full bg-card border-t lg:border-t-0 lg:border-l overflow-hidden">
				<ChatInterface
					onFileUpload={handleFileUpload}
					isUploading={isUploading}
					onMessageSent={handleTranslationRequest}
					sessionId={currentSessionId}
					uploadedFilename={uploadedFilename}
					language={language}
					onLanguageChange={setLanguage}
				/>
			</div>
		</div>
	);
}

export default App;
