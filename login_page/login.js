document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    // Example login submission handler
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    // Get username and password from form
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    // Perform validation/authentication logic here
    
    // If login is successful:
    if (loginIsSuccessful) {
        // Store username in localStorage (this is the key part)
        localStorage.setItem('loggedInUser', username);
        
        // Redirect to chatbot page
        window.location.href = 'http://127.0.0.1:3001/chatbot.html'; // Adjust path as needed
    } else {
        // Handle failed login
        alert('Login failed. Please check your credentials.');
    }
});
    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Reset error messages
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
        
        // Get form data
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Validate form data
        let isValid = true;
        
        if (!email) {
            emailError.textContent = 'Email is required';
            emailError.style.display = 'block';
            isValid = false;
        } else if (!isValidEmail(email)) {
            emailError.textContent = 'Please enter a valid email address';
            emailError.style.display = 'block';
            isValid = false;
        }
        
        if (!password) {
            passwordError.textContent = 'Password is required';
            passwordError.style.display = 'block';
            isValid = false;
        }
        
        if (isValid) {
            try {
                const response = await fetch('http://localhost:5500/api/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    // Store user data in local storage
                    localStorage.setItem('user', JSON.stringify({
                        id: data.userId,
                        name: data.name,
                        email: data.email,
                        token: data.token
                    }));
                    
                    // Redirect to home page
                    window.location.href = 'chatbot.html';
                } else {
                    // Show error message
                    if (data.field === 'email') {
                        emailError.textContent = data.message;
                        emailError.style.display = 'block';
                    } else if (data.field === 'password') {
                        passwordError.textContent = data.message;
                        passwordError.style.display = 'block';
                    } else {
                        alert(data.message || 'Login failed. Please try again.');
                    }
                }
            } catch (error) {
                console.error('Error during login:', error);
                alert('Login failed. Please try again later.');
            }
        }
    });
    
    // Helper function to validate email format
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});