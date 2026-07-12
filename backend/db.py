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

def create_conversation(user_id, title='New Chat'):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO conversations (title, user_id) VALUES (%s, %s)",
        (title, user_id)
    )
    new_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return new_id

def get_conversations(user_id):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        "SELECT id, title, created_at FROM conversations WHERE user_id = %s ORDER BY id DESC",
        (user_id,)
    )
    conversations = cursor.fetchall()
    cursor.close()
    conn.close()
    for row in conversations:
        row['created_at'] = row['created_at'].isoformat()
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
        row['created_at'] = row['created_at'].isoformat()
    return messages

def conversation_belongs_to_user(conversation_id, user_id) -> bool:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM conversations WHERE id = %s AND user_id = %s",
        (conversation_id, user_id)
    )
    result = cursor.fetchone()
    cursor.close()
    conn.close()
    return result is not None

def delete_conversation(conversation_id, user_id):
    conn = get_connection()
    cursor = conn.cursor()
    # scoped to user_id so one user can't delete another's conversation by guessing an id
    cursor.execute(
        "DELETE FROM conversations WHERE id = %s AND user_id = %s",
        (conversation_id, user_id)
    )
    conn.commit()
    cursor.close()
    conn.close()

# ---- User auth ----

def create_user(first_name, last_name, email, password_hash):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (first_name, last_name, email, password_hash) VALUES (%s, %s, %s, %s)",
        (first_name, last_name, email, password_hash)
    )
    new_id = cursor.lastrowid
    conn.commit()
    cursor.close()
    conn.close()
    return new_id

def get_user_by_email(email):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    cursor.close()
    conn.close()
    if user:
        user['created_at'] = user['created_at'].isoformat()
    return user