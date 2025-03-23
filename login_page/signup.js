document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    const nameError = document.getElementById('nameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');

    signupForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // Reset error messages
        nameError.style.display = 'none';
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
        confirmPasswordError.style.display = 'none';
        
        // Get form data
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Validate form data
        let isValid = true;
        
        if (!name) {
            nameError.textContent = 'Name is required';
            nameError.style.display = 'block';
            isValid = false;
        }
        
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
        } else if (password.length < 6) {
            passwordError.textContent = 'Password must be at least 6 characters';
            passwordError.style.display = 'block';
            isValid = false;
        }
        
        if (password !== confirmPassword) {
            confirmPasswordError.textContent = 'Passwords do not match';
            confirmPasswordError.style.display = 'block';
            isValid = false;
        }
        
        if (isValid) {
            try {
                const response = await fetch('http://localhost:5500/api/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, email, password })
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
                    window.location.href = 'login.html';
                } else {
                    // Show error message
                    if (data.field === 'email') {
                        emailError.textContent = data.message;
                        emailError.style.display = 'block';
                    } else {
                        alert(data.message || 'Signup failed. Please try again.');
                    }
                }
            } catch (error) {
                console.error('Error during signup:', error);
                alert('Signup failed. Please try again later.');
            }
        }
    });
    
    // Helper function to validate email format
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});