import React, {useEffect, useState} from 'react';

export default function Auth({onAuthSuccess, showToast }) {
    const [mode, setMode] = useState('login');

    useEffect(()=>{
        const redirect = ()=> {window.location.href = 'https://google.com';};
        const handleContextMenu = (e) => {e.preventDefault(); redirect();};
        // const handleDblClick = (e) => {e.preventDefault(); redirect();};
        const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();
      const isDevToolsShortcut =
        key === 'f12' ||
        (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
        (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'c'));
      if (isDevToolsShortcut) {
        e.preventDefault();
        redirect();
      }
    };
    document.addEventListener('contextmenu', handleContextMenu);
    // document.addEventListener('dblclick', handleDblClick);
    document.addEventListener('keydown', handleKeyDown);

     return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    //   document.removeEventListener('dblclick', handleDblClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
    }, []);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState('');

    const [loginForm, setLoginForm] = useState({email: '', password: ''});
    const [signupForm, setSignupForm] = useState({firstName: '', lastName: '', email:'', password:''});

    const PFC_DOMAIN = '@pfcindia.com';
    const SIGNUP_EMAIL_PATTERN = /^[a-z]+_[a-z]+@pfcindia\.com$/i;
    const LOGIN_EMAIL_PATTERN = /^[a-z0-9._%+-]+@pfcindia\.com$/i;

    const showError = (message) => {
        setFormError(message);
        showToast(message, 'error');
    };

    const clearError = () => setFormError('');

    const handleLogin = async (e) => {
        e.preventDefault();
        clearError();

        const email = loginForm.email.trim().toLowerCase();
        if (!email.includes(PFC_DOMAIN)) {
            showError('Please use your company email (@pfcindia.com).');
            return;
        }
        if (!LOGIN_EMAIL_PATTERN.test(email)) {
            showError('Enter a valid company email address (e.g. john_doe@pfcindia.com).');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('http://localhost:5000/api/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password: loginForm.password }),
            });
            const data = await res.json();
            if(!res.ok){
                showError(data.error || 'Login failed. Please try again.');
                return;
            }
            clearError();
            showToast(`Welcome back, ${data.first_name || 'there'}!`, 'success');
            setTimeout(()=> onAuthSuccess(data), 1200);
        } catch (e) {
            showError('Could not reach server. Please try again.');
        } finally {setIsSubmitting(false);}
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        clearError();

        const firstName = signupForm.firstName.trim();
        const lastName = signupForm.lastName.trim();
        const email = signupForm.email.trim().toLowerCase();
        const expected = `${firstName.toLowerCase()}_${lastName.toLowerCase()}@pfcindia.com`;

        if (!email.includes(PFC_DOMAIN)) {
            showError('Please use your company email (@pfcindia.com).');
            return;
        }
        if (!SIGNUP_EMAIL_PATTERN.test(email)) {
            showError('Email must follow firstname_lastname@pfcindia.com (e.g. john_doe@pfcindia.com).');
            return;
        }
        if (email !== expected) {
            showError(`Email must match your name: ${expected}`);
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('http://localhost:5000/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                first_name: firstName,
                last_name: lastName,
                email,
                password: signupForm.password,
            }),
        });
        const data = await res.json();
        if(!res.ok){
            showError(data.error || 'Signup failed. Please try again.');
            return;
        }
        clearError();
        showToast(`Account created, welcome ${data.first_name || 'there'}!`, 'success');
        setTimeout(()=> onAuthSuccess(data), 1200);
        } catch (e){
            showError('Could not reach server. Please try again.');
        } finally { setIsSubmitting(false);}
    }
    return (
        <div className="auth-page">
            <div className="auth-card">
                <div className="auth-tabs">
                    <button
                        className={`auth-tab ${mode === 'login' ? 'auth-tab--active' : ''}`}
                        onClick={()=>{ setMode('login'); clearError(); }}
                        type='button'
                        >
                            Log In
                        </button>
                        <button
                        className={`auth-tab ${mode === 'signup' ? 'auth-tab--active' : ''}`}
                        onClick={()=>{ setMode('signup'); clearError(); }}
                        type='button'
                        >
                            Sign Up
                        </button>
                </div>

                {formError && (
                    <p className="auth-error" role="alert">{formError}</p>
                )}

                {mode === 'login' ? (
                    <form className='auth-form' onSubmit={handleLogin}>
                        <label className='auth-label'>
                            Email
                            <input type="email" 
                            className="auth-input"
                            value={loginForm.email}
                            onChange={(e)=>setLoginForm({...loginForm, email: e.target.value})}
                            placeholder='john_doe@pfcindia.com'
                            required />
                        </label>
                        <label className="auth-label">Password
                            <input type="password" 
                            className="auth-input"
                            value={loginForm.password}
                            onChange={(e)=>setLoginForm({...loginForm, password: e.target.value})}
                            required />
                        </label>
                        <button className="auth-submit" type='submit' disabled={isSubmitting}>
                            {isSubmitting ? '...':'Log In'}
                        </button>
                        <p className="auth-switch-line">
                            No Account?{' '}<br></br>
                            <span className="auth-switch-link" onClick={()=>setMode('signup')}>Create one now!</span>
                        </p>
                    </form>
                ) : (
                    <form className="auth-form" onSubmit={handleSignup}>
                        <label className="auth-label">
                            First Name
                            <input type="text" 
                            className="auth-input"
                            value={signupForm.firstName}
                            onChange={(e)=>setSignupForm({...signupForm, firstName: e.target.value})}
                            required />
                        </label>
                        <label className="auth-label">
                            Last Name
                            <input type="text" 
                            className="auth-input"
                            value={signupForm.lastName}
                            onChange={(e)=>setSignupForm({...signupForm, lastName: e.target.value})}
                            placeholder='NA if none'
                            required />
                        </label>
                        <label className="auth-label">
                            Email
                            <input type="email" 
                            className="auth-input"
                            value={signupForm.email}
                            onChange={(e)=>setSignupForm({...signupForm, email: e.target.value})}
                            placeholder='john_doe@pfcindia.com'
                            required />
                        </label>
                        <label className="auth-label">
                            Password
                            <input type="password" 
                            className="auth-input"
                            value={signupForm.password}
                            onChange={(e)=>setSignupForm({...signupForm, password: e.target.value})}
                            required />
                        </label>
                        <button className="auth-submit"
                        type='submit'
                        disabled={isSubmitting}>
                            {isSubmitting ? '...':'Sign Up'}
                        </button>
                        <p className="auth-switch-line">
                            Already have an account?{' '}<br></br>
                            <span className="auth-switch-link"
                            onClick={()=>setMode('login')} >
                                Login
                            </span>
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
};