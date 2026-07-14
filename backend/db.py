import os
import mysql.connector as mysql
from dotenv import load_dotenv
from datetime import datetime, timedelta

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
        "SELECT id, title, created_at FROM conversations WHERE user_id = %s AND deleted_at IS NULL ORDER BY id DESC",
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
        "UPDATE conversations SET deleted_at = NOW() WHERE id = %s AND user_id = %s",
        (conversation_id, user_id) # soft delete, not hard
    )
    conn.commit()
    cursor.close()
    conn.close()

# ---- User auth ----

def create_user(first_name, last_name, email, password_hash, department, user_type):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (first_name, last_name, email, password_hash, department, user_type) VALUES (%s, %s, %s, %s, %s, %s)",
        (first_name, last_name, email, password_hash, department, user_type)
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
        if user.get('suspended_until'):
            user['suspended_until'] = user['suspended_until'].isoformat()
    return user

# NEW: funtion to log every login/signup event
def log_login_event(user_id, event_type):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO login_history (user_id, event_type) VALUES (%s, %s)",
        (user_id, event_type)
    )
    conn.commit()
    cursor.close()
    conn.close()

# NEW: Admin can restrict an employee's access for a fixed time or indefinitely
DURATION_MAP = {
    '1h': timedelta(hours=1),
    '4h': timedelta(hours=4),
    '12h': timedelta(hours=12),
    '1d': timedelta(days=1),
    '1w': timedelta(weeks=1),
}

def suspend_user(employee_id, admin_id, duration_key):
    conn = get_connection()
    cursor = conn.cursor()
    if duration_key == 'indefinite':
        cursor.execute(
            "UPDATE users SET is_suspended_indefinite = TRUE, suspended_until = NULL, suspended_by = %s WHERE id = %s",
            (admin_id, employee_id)
        )
    else:
        until = datetime.now() + DURATION_MAP[duration_key]
        cursor.execute(
            "UPDATE users SET is_suspended_indefinite = FALSE, suspended_until = %s, suspended_by = %s WHERE id = %s",
            (until, admin_id, employee_id)
        )
    conn.commit()
    cursor.close()
    conn.close()
    
# NEW: Admin can manually lift a suspension "until i turn it off"
def unsuspend_user(employee_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET is_suspended_indefinite = FALSE, suspended_until = NULL, suspended_by = NULL WHERE id = %s",
        (employee_id,)
    )
    conn.commit()
    cursor.close()
    conn.close()

# NEW: function to check if an employee is restricted from chatting
def is_user_suspended(user_id) -> dict:
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
         """SELECT suspended_until, is_suspended_indefinite, suspended_by,
                  (SELECT first_name FROM users WHERE id = u.suspended_by) AS admin_first_name,
                  (SELECT last_name FROM users WHERE id = u.suspended_by) AS admin_last_name
           FROM users u WHERE id = %s""",
        (user_id,)
    )
    row = cursor.fetchone()
    conn.commit()
    cursor.close()
    conn.close()
    
    if not row:
        return {'suspended': False}
 
    if row['is_suspended_indefinite']:
        admin_name = f"{row['admin_first_name']} {row['admin_last_name']}".strip()
        return {'suspended': True, 'until': None, 'admin_name': admin_name}
 
    if row['suspended_until'] and row['suspended_until'] > datetime.now():
        admin_name = f"{row['admin_first_name']} {row['admin_last_name']}".strip()
        return {'suspended': True, 'until': row['suspended_until'].isoformat(), 'admin_name': admin_name}
 
    return {'suspended': False}

# NEW - ADMIN DASHBOARD
def get_employees_by_department(department):
    '''Lists employees scoped to the admin's own dept only'''
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""select id, first_name, last_name, email, created_at
                   from users where department = %s and user_type = 'employee'
                   order by first_name""",
                   (department,))
    employees = cursor.fetchall()
    cursor.close()
    conn.close()
    for row in employees:
        row['created_at'] = row['created_at'].isoformat()
    return employees

def get_employee_detail(employee_id, department):
    '''Full detailed view for an employee'''
    conn=get_connection()
    cursor=conn.cursor(dictionary=True)
    cursor.execute(
        "select id, first_name, last_name, email, created_at from users where id = %s and department = %s and user_type='employee'",
        (employee_id, department)
    )
    employee = cursor.fetchone()
    if not employee:
        cursor.close()
        conn.close()
        return None
    employee['created_at']=employee['created_at'].isoformat()
    
    cursor.execute(
        "select id, title, created_at from conversations where user_id = %s and deleted_at is null order by id desc",
        (employee_id,)
    )
    active = cursor.fetchall()
    for c in active:
        c['created_at'] = c['created_at'].isoformat()
    
    cursor.execute("select id, title, created_at, deleted_at from conversations where user_id = %s and deleted_at is not null order by deleted_at desc",
                   (employee_id,))
    deleted = cursor.fetchall()
    for c in deleted:
        c['created_at']=c['created_at'].isoformat()
        c['deleted_at']=c['deleted_at'].isoformat()
        
    cursor.close()
    conn.close()
    employee['active_conversation'] = active
    employee['deleted_conversation']=deleted
    return employee

def get_login_history(department):
    '''Login history filtered by deptt which splits into NEW (acc in last month) and EXISTING USERS'''
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute(
        """SELECT lh.event_type, lh.created_at AS event_time,
                  u.id AS user_id, u.first_name, u.last_name, u.email, u.created_at AS account_created_at
           FROM login_history lh
           JOIN users u ON u.id = lh.user_id
           WHERE u.department = %s
           ORDER BY lh.created_at DESC
           LIMIT 200""",
        (department,)
    )
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
 
    thirty_days_ago = datetime.now() - timedelta(days=30)
    for row in rows:
        row['event_time'] = row['event_time'].isoformat()
        row['is_new_user'] = row['account_created_at'] > thirty_days_ago
        row['account_created_at'] = row['account_created_at'].isoformat()
    return rows