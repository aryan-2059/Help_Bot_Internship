import os
import mysql.connector as mysql
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return mysql.connect(
        host=os.getenv("DB_HOST"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME"),
    )
    
def save_message(sender, text, conversation_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO messages (sender, text, conversation_id) VALUES (%s, %s, %s)",
        (sender, text, conversation_id)
    )
    conn.commit()
    cursor.close()
    conn.close()

def create_conversation(title='New Chat'):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (title) VALUES (%s)",
        (title,)
    )
    new_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return new_id

def get_conversations():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT id, title, created_at FROM conversations ORDER BY id DESC")
    conversations = cursor.fetchall()
    cursor.close()
    conn.close()
    for row in conversations:
        row['created_at'] = row['created_at'].isoformat()  # Convert datetime to string
    return conversations

def get_messages_by_conversations(conversation_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT sender, text, created_at FROM messages WHERE conversation_id = %s ORDER BY id ASC",
        (conversation_id,)
    )
    messages = cursor.fetchall()
    cursor.close()
    conn.close()
    for row in messages:
        row['created_at'] = row['created_at'].isoformat()  # Convert datetime to string
    return messages