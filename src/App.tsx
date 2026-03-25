import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ChatHistorySidebar } from "./components/ChatHistorySidebar";
import { ChatInterface } from "./components/ChatInterface";
import { PDFViewer } from "./components/PDFViewer";
import { TranslatedView } from "./components/TranslatedView";
import { LANGUAGES } from "./lib/translations";

function App() {
	const [socket, setSocket] = useState<Socket | null>(null);
	const [pdfFile, setPdfFile] = useState<File | string | null>(null);
	const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [translatedPages, setTranslatedPages] = useState<string[] | null>(null);

	const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [language, setLanguage] = useState("english");

	useEffect(() => {
		const newSocket = io("http://localhost:8888");
		setSocket(newSocket);
		createNewChat();
		return () => {
			newSocket.disconnect();
		};
	}, []);

	const createNewChat = async () => {
		try {
			const response = await fetch("http://localhost:8888/api/chats", { method: "POST" });
			if (response.ok) {
				const chat = await response.json();
				setCurrentSessionId(chat.id);
			}
		} catch (error) {
			console.error("Failed to create new chat:", error);
		}
	};

	const handleFileUpload = async (file: File) => {
		setIsUploading(true);
		const formData = new FormData();
		formData.append("pdf", file);

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

	const handleTranslationRequest = (message: string) => {
		const lowerMsg = message.toLowerCase();
		if (lowerMsg.includes("translate") && uploadedFilename) {
			// Extract language codes to check against
			const languageCodes = LANGUAGES.map(l => l.code).filter(c => c !== "english");
			const targetLang = languageCodes.find((l) => lowerMsg.includes(l));

			if (targetLang) {
				socket?.emit("translate_document", { language: targetLang, filename: uploadedFilename });
			}
		}
	};

	useEffect(() => {
		if (socket) {
			socket.on("translation_complete", (data: { pages: string[] }) => {
				setTranslatedPages(data.pages);
			});
			socket.on("error", (err: any) => {
				console.error("Socket error:", err);
			});
		}
		return () => {
			socket?.off("translation_complete");
			socket?.off("error");
		}
	}, [socket]);

	return (
		<div className="flex h-screen w-screen overflow-hidden bg-background font-sans text-foreground">
			<ChatHistorySidebar
				isOpen={isSidebarOpen}
				onClose={() => setIsSidebarOpen(false)}
				onSelectChat={setCurrentSessionId}
				onNewChat={createNewChat}
				currentChatId={currentSessionId}
				language={language}
			/>

			{/* Left Side: PDFBox */}
			<div className="w-1/2 h-full bg-card">
				{translatedPages ? (
					<TranslatedView pages={translatedPages} onClose={() => setTranslatedPages(null)} language={language} />
				) : (
					<PDFViewer file={pdfFile} onOpenSidebar={() => setIsSidebarOpen(true)} language={language} />
				)}
			</div>

			{/* Right Side: Chat Interface */}
			<div className="w-1/2 h-full bg-card border-l">
				<ChatInterface
					socket={socket}
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
