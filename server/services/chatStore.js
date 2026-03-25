import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure storage directory exists
const STORAGE_DIR = path.join(__dirname, '../storage/chats');

if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, {recursive: true});
}

export const getAllChats = () => {
    try {
        const files = fs.readdirSync(STORAGE_DIR).filter(file => file.endsWith('.json'));
        const chats = files.map(file => {
            const filePath = path.join(STORAGE_DIR, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            const chatData = JSON.parse(content);
            const stats = fs.statSync(filePath);

            // Get first message as preview if available
            const firstMessage = chatData.messages && chatData.messages.length > 0
                ? chatData.messages.find(m => m.role === 'user')?.content || 'No messages'
                : 'Empty chat';

            return {
                id: chatData.id,
                title: chatData.customTitle || firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : ''),
                timestamp: stats.mtime,
                messageCount: chatData.messages ? chatData.messages.length : 0
            };
        });

        // Sort by newest first
        return chats.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
        console.error('Error reading chat history:', error);
        return [];
    }
};

export const getChatById = (id) => {
    try {
        const filePath = path.join(STORAGE_DIR, `${id}.json`);
        if (!fs.existsSync(filePath)) {
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error reading chat ${id}:`, error);
        return null;
    }
};

export const createChat = () => {
    const id = Date.now().toString();
    const newChat = {
        id,
        createdAt: new Date(),
        messages: []
    };

    saveChat(newChat);
    return newChat;
};

export const saveMessage = (chatId, message) => {
    let chat = getChatById(chatId);

    if (!chat) {
        // If chat doesn't exist, create it (fallback)
        chat = {
            id: chatId,
            createdAt: new Date(),
            messages: []
        };
    }

    chat.messages.push(message);
    saveChat(chat);
    return chat;
};

const saveChat = (chat) => {
    try {
        const filePath = path.join(STORAGE_DIR, `${chat.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(chat, null, 2));
    } catch (error) {
        console.error(`Error saving chat ${chat.id}:`, error);
    }
};

export const deleteChat = (id) => {
    try {
        const filePath = path.join(STORAGE_DIR, `${id}.json`);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error deleting chat ${id}:`, error);
        return false;
    }
};

export const updateChatTitle = (id, newTitle) => {
    try {
        const chat = getChatById(id);
        if (chat) {
            chat.customTitle = newTitle;
            saveChat(chat);
            return chat;
        }
        return null;
    } catch (error) {
        console.error(`Error updating chat ${id}:`, error);
        return null;
    }
};
