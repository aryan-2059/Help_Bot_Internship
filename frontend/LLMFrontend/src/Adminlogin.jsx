import React, {useState} from 'react';

const DEPARTMENTS = [
  "HR", "IT", "Legal", "Finance & Accounting", "Marketing", "Customer Service", "Sales", "Administration",
];

export default function AdminLogin({onAdminAuthSuccess, onGoBack, showToast}){
    const[form, setForm] = useState({firstName: '', lastName: '', email: '', password:'', department:''});
    const[isSubmitting, setIsSubmitting] = useState(false);
    const[formError, setFormError] = useState('');

    const showError = (message)=>{
        setFormError(message);
        showToast(message, 'error');
    };
    const clearError = () => setFormError('');

    const handleAdminLogin = async(e)=>{
        e.preventDefault();
        clearError();

        if(!form.department){
            showError('Please select a department.')
            return;
        }
        setIsSubmitting(true);
        try{
            const res = await fetch('http://localhost:5000/api/admin/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    first_name = form.firstName,
                    last_name: form.lastName,
                    email: form.email.trim().toLowerCase(),
                    password: form.password,
                    department: form.department,
                }),
            });
            const data = await res.json();
            if(!res.ok){
                showError(data.error || 'Admin login failed. Please try again,');
                return;
            }
            clearError();
            showToast(`Welcome back, Admin ${data.first_name || ''}!`, 'success');
            setTimeout(() =>onAdminAuthSuccess(data), 1200);
        }catch(e){ showError('Could not reach server. Please try again later.');}
        finally{setIsSubmitting(false);}
    };
    return 
    (
        <div className="auth-page">
            <div className="auth-card">
                <div className="admin-login-banner">You are signing in as an Admin</div>

                {formError && (
                    <p className="auth-error" role='alert'>{formError}</p>
                )}
                
                <form className="auth-form" onSubmit={handleAdminLogin}>
                    <label className="auth-label">
                        First Name
                        <input type="text" className="auth-input" value={form.firstName}
                        onChange={(e)=>setForm({...form, firstName: e.target.value})} required />
                    </label>
                    <label className="auth-label">
                        Last Name
                        <input type="text" className="auth-input"
                        value={form.lastName}
                        onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                        required />
                    </label>
                    <label className="auth-label">
                        Department
                        <select className="auth-input"
                            value={form.department}
                            onChange={(e) => setForm({ ...form, department: e.target.value })}
                            required>
                            <option value="" disabled>Select department</option>
                            {DEPARTMENTS.map((d) => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </label>
                    <label className="auth-label">
                        Email
                        <input type="email" className="auth-input"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            placeholder="admin_it@pfcindia.com"
                            required />
                    </label>
                    <label className="auth-label">
                        Password
                        <input type="password" className="auth-input"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required />
                    </label>
                    <button className="auth-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? '...' : 'Sign In as Admin'}
                    </button>
                    <button type="button" className="admin-login-goback" onClick={onGoBack}>
                        ← Go back
                    </button>
                </form>

            </div>
        </div>
    )
}