# EcoEats: Save Food, Save Money, Save the Planet

EcoEats is a robust full-stack marketplace connecting consumers with local cloud kitchens and restaurants that have surplus food. The platform aims to reduce global food waste by allowing kitchens to list perfectly good, unsold food at significant discounts, providing affordable meals to customers.

## Key Features

*   **Dynamic Surplus Marketplace:** Real-time visibility of discounted food deals, marked with urgency tags (e.g., "Closing Soon", "Only 2 left!").
*   **Kitchen Dashboard:** Admin portal for registered partner kitchens to manage active listings, instantly bump or reduce surplus stock quantities, and view live order statuses.
*   **Real-time Notifications:** In-app notification system that simulates delivery and alerts users exactly when their order is confirmed, 10 minutes away, and upon arrival.
*   **Seamless Payments:** Integrated with PhonePe's UPI Gateway (Sandbox) for slick, secure transitions from shopping cart to digital payment.
*   **Wishlist & Cart System:** Dynamic cart architecture preventing multi-kitchen checkouts alongside an interactive wishlist where users can "heart" deals.
*   **Global Dark Mode:** A complete UI toggle providing an accessible, sleek dark aesthetic across every component. 
*   **Secure User Management:** End-to-end JWT authenticated login flows, encrypted passwords, self-delete account functionalities, and forgot password handling.

## Technology Stack

### Frontend
*   **HTML5 & CSS3:** Completely vanilla CSS, leveraging modern flexbox grids, UI variables for theme switching, and glassmorphism styling.
*   **Vanilla JavaScript (ES6+):** Complete manipulation and local state management (LocalStorage) without relying on hefty frontend frameworks.
*   **FontAwesome:** Embedded scalable vector iconography.

### Backend
*   **Node.js & Express.js:** Scalable RESTful API backbone facilitating everything from user auth to order creation.
*   **SQLite (sqlite3):** Lightweight SQL-based relational database management for blazing-fast local deployment and schema relations.
*   **PhonePe SDK / HTTP Clients:** Backend proxy integration to handle encrypted UPI transaction hashing and verification with the PhonePe merchant gateway.

### Security
*   **JSON Web Tokens (JWT):** Protected REST execution on sensitive API routes.
*   **Bcrypt.js:** Industry-standard salt/hash encryption for critical data points like passwords.

## Installation & Usage

### Prerequisites
Make sure you have Node JS installed globally on your machine.

### Installation
1. Clone the repository to your local machine.
2. Navigate into the backend directory:
   ```bash
   cd backend
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

### Running the App
1. Inside the `backend` directory, start the Express server and seed the SQLite database:
   ```bash
   node server.js
   ```
2. The REST API will mount on `http://localhost:5000` and statically serve the frontend documents. 
3. Open `http://localhost:5000/index.html` in your web browser of choice.

## Database Seeding
Upon initialization, the system automatically creates a volatile `ecoeats.db` file seeded with generic "Test User" data, 10 local Bangalore kitchen vendors (like *Spice Garden Kitchen*, *Tokyo Bites*), and generates mock surplus food inventory with dynamic closing countdowns.
