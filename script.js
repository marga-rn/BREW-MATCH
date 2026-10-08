// ======================================================
// BREW//MATCH - USER WEBSITE
// FULL SCRIPT WITH LIVE ORDER STATUS
// ======================================================

// ===============================
// SUPABASE
// ===============================

const SUPABASE_URL = "https://fogtqyqezpizfohfgyua.supabase.co";

const SUPABASE_KEY = "sb_publishable_E99zjEeYHOri2xdSTIa7kQ_zUIPLhYB";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ===============================
// GLOBAL VARIABLES
// ===============================

let currentUser = null;
let products = [];
let cart = [];
let selectedProduct = null;

let ordersChannel = null;
let ordersPoller = null;
let ordersLoading = false;

let quizAnswers = {
    strength: null,
    sweetness: null,
    mood: null
};


// ===============================
// PAGE LOAD
// ===============================

document.addEventListener("DOMContentLoaded", async () => {

    setupQuiz();

    await loadProducts();

    await checkUser();

    updateCartCount();

});


// ===============================
// AUTH SESSION CHECK
// ===============================

async function checkUser() {

    const {
        data: { session },
        error
    } = await supabaseClient.auth.getSession();

    if (error) {
        console.error("Session error:", error);
        return;
    }

    if (session) {

        currentUser = session.user;

        updateAuthUI();

        await loadOrders();

        startOrderRealtime();

    } else {

        currentUser = null;

        updateAuthUI();

    }
}


// ===============================
// AUTH STATE LISTENER
// ===============================

supabaseClient.auth.onAuthStateChange((event, session) => {

    currentUser = session ? session.user : null;

    updateAuthUI();

    if (currentUser) {

        // Avoid doing async Supabase work directly
        // inside the auth callback.
        setTimeout(async () => {

            await loadOrders();

            startOrderRealtime();

        }, 0);

    } else {

        stopOrderRealtime();

        clearOrdersDisplay();

    }

});


// ======================================================
// AUTH UI
// ======================================================

function updateAuthUI() {

    const loginButton = document.getElementById("loginButton");
    const logoutButton = document.getElementById("logoutButton");

    if (currentUser) {

        if (loginButton) {
            loginButton.style.display = "none";
        }

        if (logoutButton) {
            logoutButton.style.display = "inline-block";
        }

    } else {

        if (loginButton) {
            loginButton.style.display = "inline-block";
        }

        if (logoutButton) {
            logoutButton.style.display = "none";
        }

    }

}


// ======================================================
// SIGN UP
// ======================================================

async function register() {

    const name = document.getElementById("registerName")?.value.trim();
    const email = document.getElementById("registerEmail")?.value.trim();
    const password = document.getElementById("registerPassword")?.value;

    if (!name || !email || !password) {

        alert("Please complete all registration fields.");

        return;
    }

    if (password.length < 6) {

        alert("Password must be at least 6 characters.");

        return;
    }


    const {
        data,
        error
    } = await supabaseClient.auth.signUp({

        email: email,

        password: password,

        options: {
            data: {
                full_name: name
            }
        }

    });


    if (error) {

        console.error(error);

        alert(error.message);

        return;
    }


    if (data.user) {

        // Create profile
        const { error: profileError } = await supabaseClient
            .from("profiles")
            .upsert({

                id: data.user.id,

                email: email,

                full_name: name

            }, {

                onConflict: "id"

            });


        if (profileError) {

            console.error("Profile error:", profileError);

        }

    }


    if (data.session) {

        alert("Account created successfully!");

        closeAuth();

    } else {

        alert(
            "Account created. If email confirmation is enabled in Supabase, please confirm your email first."
        );

        showLogin();

    }

}


// ======================================================
// LOGIN
// ======================================================

async function login() {

    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value;

    if (!email || !password) {

        alert("Please enter your email and password.");

        return;
    }


    const {
        data,
        error
    } = await supabaseClient.auth.signInWithPassword({

        email: email,

        password: password

    });


    if (error) {

        console.error(error);

        alert(error.message);

        return;
    }


    currentUser = data.user;

    updateAuthUI();

    closeAuth();

    await loadOrders();

    startOrderRealtime();

}


// ======================================================
// LOGOUT
// ======================================================

async function logout() {

    stopOrderRealtime();

    await supabaseClient.auth.signOut();

    currentUser = null;

    cart = [];

    updateCartCount();

    updateAuthUI();

    clearOrdersDisplay();

}


// ======================================================
// AUTH MODAL
// ======================================================

function openAuth() {

    const modal = document.getElementById("authModal");

    if (modal) {

        modal.style.display = "flex";

    }

}


function closeAuth() {

    const modal = document.getElementById("authModal");

    if (modal) {

        modal.style.display = "none";

    }

}


function showLogin() {

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    if (loginForm) {
        loginForm.style.display = "block";
    }

    if (registerForm) {
        registerForm.style.display = "none";
    }

}


function showRegister() {

    const loginForm = document.getElementById("loginForm");
    const registerForm = document.getElementById("registerForm");

    if (loginForm) {
        loginForm.style.display = "none";
    }

    if (registerForm) {
        registerForm.style.display = "block";
    }

}


// ======================================================
// LOAD PRODUCTS
// ======================================================

async function loadProducts() {

    const {
        data,
        error
    } = await supabaseClient
        .from("products")
        .select("*")
        .eq("available", true)
        .order("id", { ascending: true });


    if (error) {

        console.error("Products error:", error);

        return;
    }


    products = data || [];

    renderProducts();

}


// ======================================================
// RENDER PRODUCTS
// ======================================================

function renderProducts() {

    const grid = document.getElementById("menuGrid");

    if (!grid) return;


    if (!products.length) {

        grid.innerHTML = `
            <div style="
                grid-column:1/-1;
                text-align:center;
                padding:40px;
            ">
                <h3>No coffee available right now.</h3>
                <p>Please check again later.</p>
            </div>
        `;

        return;
    }


    grid.innerHTML = products.map(product => {

        return `

            <div class="product-card">

                <div class="product-icon">
                    ${product.icon || "☕"}
                </div>

                <h3>${escapeHTML(product.name)}</h3>

                <p>
                    ${escapeHTML(product.description || "")}
                </p>

                <strong>
                    ₱${Number(product.price).toFixed(2)}
                </strong>

                <br><br>

                <button
                    onclick="openCustomize(${product.id})"
                    class="primary-btn"
                >
                    Customize
                </button>

            </div>

        `;

    }).join("");

}


// ======================================================
// CUSTOMIZATION
// ======================================================

function openCustomize(productId) {

    selectedProduct = products.find(
        product => product.id === productId
    );


    if (!selectedProduct) return;


    const modal = document.getElementById("customizeModal");

    if (!modal) return;


    const nameElement =
        document.getElementById("customizeProductName");

    const priceElement =
        document.getElementById("customizeProductPrice");


    if (nameElement) {

        nameElement.textContent =
            selectedProduct.name;

    }


    if (priceElement) {

        priceElement.textContent =
            `₱${Number(selectedProduct.price).toFixed(2)}`;

    }


    modal.style.display = "flex";

}


function closeCustomize() {

    const modal = document.getElementById("customizeModal");

    if (modal) {

        modal.style.display = "none";

    }

}


// ======================================================
// ADD TO CART
// ======================================================

function addToCart() {

    if (!selectedProduct) return;


    const size =
        document.getElementById("customizeSize")?.value ||
        "Small";


    const milk =
        document.getElementById("customizeMilk")?.value ||
        "Regular Milk";


    const sweetness =
        document.getElementById("customizeSweetness")?.value ||
        "Regular";


    const extraShot =
        document.getElementById("customizeExtraShot")?.checked ||
        false;


    let price = Number(selectedProduct.price);


    if (size === "Medium") {

        price += 15;

    }

    if (size === "Large") {

        price += 25;

    }

    if (extraShot) {

        price += 30;

    }


    cart.push({

        product_id: selectedProduct.id,

        product_name: selectedProduct.name,

        size: size,

        milk: milk,

        sweetness: sweetness,

        extra_shot: extraShot,

        quantity: 1,

        price: price

    });


    updateCartCount();

    renderCart();

    closeCustomize();

}


// ======================================================
// CART
// ======================================================

function updateCartCount() {

    const countElement =
        document.getElementById("cartCount");

    if (!countElement) return;


    const count = cart.reduce(
        (sum, item) => sum + item.quantity,
        0
    );


    countElement.textContent = count;

}


function openCart() {

    renderCart();

    const modal = document.getElementById("cartModal");

    if (modal) {

        modal.style.display = "flex";

    }

}


function closeCart() {

    const modal = document.getElementById("cartModal");

    if (modal) {

        modal.style.display = "none";

    }

}


function renderCart() {

    const container =
        document.getElementById("cartItems");

    const totalElement =
        document.getElementById("cartTotal");


    if (!container) return;


    if (!cart.length) {

        container.innerHTML = `
            <p style="text-align:center;padding:25px;">
                Your cart is empty.
            </p>
        `;

        if (totalElement) {

            totalElement.textContent = "₱0.00";

        }

        return;
    }


    let total = 0;


    container.innerHTML = cart.map((item, index) => {

        const itemTotal =
            Number(item.price) *
            Number(item.quantity);


        total += itemTotal;


        return `

            <div class="cart-item">

                <div>

                    <strong>
                        ${escapeHTML(item.product_name)}
                    </strong>

                    <small>
                        ${escapeHTML(item.size)}
                        ·
                        ${escapeHTML(item.milk)}
                        ·
                        ${escapeHTML(item.sweetness)}
                        ${item.extra_shot ? " · Extra Shot" : ""}
                    </small>

                </div>

                <div>

                    ₱${itemTotal.toFixed(2)}

                    <button
                        onclick="removeFromCart(${index})"
                    >
                        ×
                    </button>

                </div>

            </div>

        `;

    }).join("");


    if (totalElement) {

        totalElement.textContent =
            `₱${total.toFixed(2)}`;

    }

}


function removeFromCart(index) {

    cart.splice(index, 1);

    updateCartCount();

    renderCart();

}


// ======================================================
// CHECKOUT
// ======================================================

function openCheckout() {

    if (!currentUser) {

        alert("Please login first.");

        openAuth();

        return;
    }


    if (!cart.length) {

        alert("Your cart is empty.");

        return;
    }


    closeCart();


    const modal =
        document.getElementById("checkoutModal");


    if (modal) {

        modal.style.display = "flex";

    }

}


function closeCheckout() {

    const modal =
        document.getElementById("checkoutModal");


    if (modal) {

        modal.style.display = "none";

    }

}


// ======================================================
// PLACE ORDER
// ======================================================

async function placeOrder() {

    if (!currentUser) {

        alert("Please login first.");

        return;
    }


    if (!cart.length) {

        alert("Your cart is empty.");

        return;
    }


    const fulfillment =
        document.getElementById("fulfillment")?.value ||
        "Dine In";


    const deliveryAddress =
        document.getElementById("deliveryAddress")?.value.trim() ||
        null;


    if (
        fulfillment === "Delivery" &&
        !deliveryAddress
    ) {

        alert("Please enter your delivery address.");

        return;
    }


    const total = cart.reduce(
        (sum, item) =>
            sum +
            Number(item.price) *
            Number(item.quantity),
        0
    );


    const orderNumber =
        "BM-" +
        Date.now().toString().slice(-8);


    const {
        data: order,
        error: orderError
    } = await supabaseClient
        .from("orders")
        .insert({

            order_number: orderNumber,

            user_id: currentUser.id,

            total: total,

            fulfillment: fulfillment,

            delivery_address:
                fulfillment === "Delivery"
                    ? deliveryAddress
                    : null,

            status: "Order Received"

        })
        .select()
        .single();


    if (orderError) {

        console.error(orderError);

        alert(
            "Unable to place order: " +
            orderError.message
        );

        return;
    }


    const orderItems = cart.map(item => ({

        order_id: order.id,

        product_id: item.product_id,

        product_name: item.product_name,

        size: item.size,

        milk: item.milk,

        sweetness: item.sweetness,

        extra_shot: item.extra_shot,

        quantity: item.quantity,

        price: item.price

    }));


    const {
        error: itemsError
    } = await supabaseClient
        .from("order_items")
        .insert(orderItems);


    if (itemsError) {

        console.error(itemsError);

        alert(
            "Order was created but items could not be saved: " +
            itemsError.message
        );

        return;
    }


    cart = [];

    updateCartCount();

    renderCart();

    closeCheckout();


    alert(
        `Order ${orderNumber} placed successfully!`
    );


    await loadOrders();

    startOrderRealtime();


    const ordersSection =
        document.getElementById("orders");


    if (ordersSection) {

        ordersSection.scrollIntoView({
            behavior: "smooth"
        });

    }

}


// ======================================================
// ORDERS
// ======================================================

async function loadOrders() {

    if (!currentUser) return;

    if (ordersLoading) return;


    ordersLoading = true;


    try {

        const {
            data,
            error
        } = await supabaseClient
            .from("orders")
            .select(`
                *,
                order_items (*)
            `)
            .eq("user_id", currentUser.id)
            .order("created_at", {
                ascending: false
            });


        if (error) {

            console.error(
                "LOAD ORDERS ERROR:",
                error
            );

            showOrdersError(error.message);

            return;
        }


        renderOrders(data || []);

    } catch (error) {

        console.error(
            "Unexpected orders error:",
            error
        );

    } finally {

        ordersLoading = false;

    }

}


// ======================================================
// RENDER ORDERS
// ======================================================

function renderOrders(orders) {

    const container =
        document.getElementById("ordersContainer");


    if (!container) return;


    if (!orders.length) {

        container.innerHTML = `

            <div class="order-card">

                <h3>No orders yet.</h3>

                <p>
                    Your orders will appear here.
                </p>

            </div>

        `;

        return;
    }


    container.innerHTML = orders.map(order => {

        const items = order.order_items || [];


        const itemsHTML = items.map(item => {

            return `

                <div style="
                    display:flex;
                    justify-content:space-between;
                    gap:15px;
                    padding:8px 0;
                    border-bottom:1px solid #eee;
                ">

                    <span>
                        ${escapeHTML(item.product_name)}
                        × ${item.quantity}
                    </span>

                    <strong>
                        ₱${(
                            Number(item.price) *
                            Number(item.quantity)
                        ).toFixed(2)}
                    </strong>

                </div>

            `;

        }).join("");


        const statusHTML =
            createOrderStatusHTML(order.status);


        const updatedTime =
            order.updated_at
                ? new Date(order.updated_at)
                    .toLocaleString()
                : "—";


        return `

            <div class="order-card">

                <div style="
                    display:flex;
                    justify-content:space-between;
                    gap:15px;
                    align-items:flex-start;
                    flex-wrap:wrap;
                ">

                    <div>

                        <h3>
                            Order #${escapeHTML(
                                order.order_number
                            )}
                        </h3>

                        <p>
                            ${new Date(
                                order.created_at
                            ).toLocaleString()}
                        </p>

                    </div>


                    <div class="status">

                        ${escapeHTML(order.status)}

                    </div>

                </div>


                <!-- LIVE STATUS -->

                <div style="
                    margin-top:18px;
                    padding:15px;
                    border-radius:12px;
                    background:#f6f1ea;
                    border:1px solid #e3d5c5;
                ">

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        gap:10px;
                    ">

                        <strong>
                            🔴 LIVE ORDER STATUS
                        </strong>

                        <span style="
                            font-size:12px;
                            color:#777;
                        ">
                            Auto-updating
                        </span>

                    </div>


                    ${statusHTML}


                    <div style="
                        margin-top:10px;
                        font-size:12px;
                        color:#777;
                    ">

                        Last updated:
                        ${escapeHTML(updatedTime)}

                    </div>

                </div>


                <div style="margin-top:18px;">

                    <strong>Order Items</strong>

                    <div style="margin-top:8px;">

                        ${itemsHTML}

                    </div>

                </div>


                <div style="
                    margin-top:18px;
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:15px;
                    flex-wrap:wrap;
                ">

                    <span>
                        ${escapeHTML(order.fulfillment)}
                    </span>

                    <strong>
                        Total:
                        ₱${Number(order.total).toFixed(2)}
                    </strong>

                </div>


                ${
                    order.delivery_address
                        ? `
                            <p style="
                                margin-top:10px;
                            ">
                                📍
                                ${escapeHTML(
                                    order.delivery_address
                                )}
                            </p>
                        `
                        : ""
                }

            </div>

        `;

    }).join("");

}


// ======================================================
// STATUS DISPLAY
// ======================================================

function createOrderStatusHTML(status) {

    if (status === "Cancelled") {

        return `

            <div style="
                margin-top:12px;
                padding:12px;
                border-radius:10px;
                background:#ffe8e8;
                color:#a33;
                font-weight:bold;
            ">

                ❌ Order Cancelled

            </div>

        `;

    }


    const steps = [

        "Order Received",

        "Preparing",

        "Ready for Pick-up",

        "Out for Delivery",

        "Completed"

    ];


    const currentIndex =
        steps.indexOf(status);


    return `

        <div style="
            display:flex;
            flex-direction:column;
            gap:7px;
            margin-top:14px;
        ">

            ${steps.map((step, index) => {

                const isActive =
                    index <= currentIndex;

                const isCurrent =
                    step === status;


                return `

                    <div style="
                        display:flex;
                        align-items:center;
                        gap:10px;
                        padding:8px 10px;
                        border-radius:8px;

                        background:${
                            isCurrent
                                ? "#e8dccd"
                                : "transparent"
                        };

                        font-weight:${
                            isCurrent
                                ? "700"
                                : "400"
                        };
                    ">

                        <span style="
                            width:22px;
                            height:22px;
                            border-radius:50%;
                            display:flex;
                            align-items:center;
                            justify-content:center;

                            background:${
                                isActive
                                    ? "#6f4e37"
                                    : "#ddd"
                            };

                            color:${
                                isActive
                                    ? "white"
                                    : "#777"
                            };

                            font-size:12px;
                        ">

                            ${
                                isActive
                                    ? "✓"
                                    : index + 1
                            }

                        </span>


                        <span>
                            ${escapeHTML(step)}
                        </span>

                    </div>

                `;

            }).join("")}

        </div>

    `;

}


// ======================================================
// REALTIME ORDER SUBSCRIPTION
// ======================================================

function startOrderRealtime() {

    if (!currentUser) return;


    // Remove previous realtime connection
    // so we do not create duplicate channels.

    stopRealtimeChannelOnly();


    const userId = currentUser.id;


    console.log(
        "Starting realtime for user:",
        userId
    );


    ordersChannel =
        supabaseClient
            .channel(
                `user-orders-${userId}-${Date.now()}`
            )

            // ------------------------------------------
            // ORDER UPDATED
            // ------------------------------------------

            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "orders",
                    filter: `user_id=eq.${userId}`
                },
                payload => {

                    console.log(
                        "🔥 REALTIME ORDER UPDATE:",
                        payload
                    );


                    // Reload immediately

                    loadOrders();

                }
            )

            // ------------------------------------------
            // ORDER INSERTED
            // ------------------------------------------

            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "orders",
                    filter: `user_id=eq.${userId}`
                },
                payload => {

                    console.log(
                        "🔥 REALTIME NEW ORDER:",
                        payload
                    );


                    loadOrders();

                }
            )

            // ------------------------------------------
            // SUBSCRIBE
            // ------------------------------------------

            .subscribe(status => {

                console.log(
                    "📡 ORDER REALTIME STATUS:",
                    status
                );


                if (status === "SUBSCRIBED") {

                    console.log(
                        "✅ ORDER REALTIME CONNECTED!"
                    );

                }


                if (
                    status === "CHANNEL_ERROR"
                ) {

                    console.error(
                        "❌ REALTIME CHANNEL ERROR"
                    );

                }


                if (
                    status === "TIMED_OUT"
                ) {

                    console.error(
                        "❌ REALTIME TIMED OUT"
                    );

                }


                if (
                    status === "CLOSED"
                ) {

                    console.warn(
                        "⚠️ REALTIME CHANNEL CLOSED"
                    );

                }

            });


    // ==================================================
    // FALLBACK POLLING
    // ==================================================
    //
    // Kahit hindi gumana ang Realtime publication,
    // automatic pa ring iche-check ang orders.
    //
    // Every 2 seconds.
    //

    if (ordersPoller) {

        clearInterval(ordersPoller);

    }


    ordersPoller = setInterval(() => {

        if (currentUser) {

            loadOrders();

        }

    }, 2000);


}


// ======================================================
// STOP REALTIME
// ======================================================

function stopRealtimeChannelOnly() {

    if (ordersChannel) {

        console.log(
            "Removing old realtime channel..."
        );


        supabaseClient.removeChannel(
            ordersChannel
        );


        ordersChannel = null;

    }

}


function stopOrderRealtime() {

    stopRealtimeChannelOnly();


    if (ordersPoller) {

        clearInterval(ordersPoller);

        ordersPoller = null;

    }

}


// ======================================================
// PAGE VISIBILITY / FOCUS
// ======================================================

document.addEventListener(
    "visibilitychange",
    () => {

        if (
            !document.hidden &&
            currentUser
        ) {

            console.log(
                "Page visible - refreshing orders..."
            );

            loadOrders();

        }

    }
);


window.addEventListener(
    "focus",
    () => {

        if (currentUser) {

            console.log(
                "Window focused - refreshing orders..."
            );

            loadOrders();

        }

    }
);


// ======================================================
// ORDER ERROR
// ======================================================

function showOrdersError(message) {

    const container =
        document.getElementById("ordersContainer");


    if (!container) return;


    container.innerHTML = `

        <div class="order-card">

            <h3>Unable to load orders</h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;

}


// ======================================================
// CLEAR ORDERS
// ======================================================

function clearOrdersDisplay() {

    const container =
        document.getElementById("ordersContainer");


    if (!container) return;


    container.innerHTML = `

        <div class="order-card">

            <h3>Please log in</h3>

            <p>
                Log in to view your orders.
            </p>

        </div>

    `;

}


// ======================================================
// BREW MATCH QUIZ
// ======================================================

function setupQuiz() {

    const quizButtons =
        document.querySelectorAll(
            "[data-question]"
        );


    quizButtons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const question =
                    button.dataset.question;

                const value =
                    button.dataset.value;


                if (
                    question &&
                    value
                ) {

                    quizAnswers[question] =
                        value;

                }

            }
        );

    });

}


// ======================================================
// BREW MATCH RECOMMENDATION
// ======================================================

async function getBrewMatch() {

    if (
        !quizAnswers.strength ||
        !quizAnswers.sweetness ||
        !quizAnswers.mood
    ) {

        alert(
            "Please answer all quiz questions first."
        );

        return;
    }


    const {
        data,
        error
    } = await supabaseClient
        .from("products")
        .select("*")
        .eq("available", true);


    if (error) {

        console.error(error);

        alert(
            "Unable to get recommendations."
        );

        return;
    }


    const availableProducts = data || [];


    if (!availableProducts.length) {

        alert(
            "No available coffee products right now."
        );

        return;
    }


    let bestProduct = null;

    let bestScore = -1;


    availableProducts.forEach(product => {

        let score = 0;


        if (
            product.strength ===
            quizAnswers.strength
        ) {

            score += 3;

        }


        if (
            product.sweetness ===
            quizAnswers.sweetness
        ) {

            score += 3;

        }


        if (
            product.mood ===
            quizAnswers.mood
        ) {

            score += 3;

        }


        if (score > bestScore) {

            bestScore = score;

            bestProduct = product;

        }

    });


    if (!bestProduct) {

        alert(
            "No recommendation available."
        );

        return;
    }


    // Save quiz result if logged in

    if (currentUser) {

        const {
            error: saveError
        } = await supabaseClient
            .from("quiz_results")
            .insert({

                user_id: currentUser.id,

                strength:
                    quizAnswers.strength,

                sweetness:
                    quizAnswers.sweetness,

                mood:
                    quizAnswers.mood,

                recommended_product_id:
                    bestProduct.id

            });


        if (saveError) {

            console.error(
                "Quiz save error:",
                saveError
            );

        }

    }


    showQuizResult(bestProduct);

}


// ======================================================
// SHOW QUIZ RESULT
// ======================================================

function showQuizResult(product) {

    const result =
        document.getElementById("quizResult");


    if (!result) {

        alert(
            `Your Brew Match is ${product.name}!`
        );

        return;
    }


    result.innerHTML = `

        <div>

            <div style="
                font-size:50px;
            ">
                ${product.icon || "☕"}
            </div>


            <h3>
                Your Brew Match:
            </h3>


            <h2>
                ${escapeHTML(product.name)}
            </h2>


            <p>
                ${escapeHTML(
                    product.description || ""
                )}
            </p>


            <strong>
                ₱${Number(product.price).toFixed(2)}
            </strong>


            <br><br>


            <button
                onclick="openCustomize(${product.id})"
                class="primary-btn"
            >
                Try This Brew
            </button>

        </div>

    `;


    result.style.display = "block";

}


// ======================================================
// UTILITY
// ======================================================

function escapeHTML(value) {

    if (value === null || value === undefined) {

        return "";

    }


    return String(value)

        .replace(/&/g, "&amp;")

        .replace(/</g, "&lt;")

        .replace(/>/g, "&gt;")

        .replace(/"/g, "&quot;")

        .replace(/'/g, "&#039;");

}


// ======================================================
// CLOSE MODALS WHEN CLICKING OUTSIDE
// ======================================================

window.addEventListener(
    "click",
    event => {

        const modals =
            document.querySelectorAll(".modal");


        modals.forEach(modal => {

            if (event.target === modal) {

                modal.style.display = "none";

            }

        });

    }
);

function scrollToSection(sectionId) {
    const section = document.getElementById(sectionId);

    if (!section) {
        console.warn("Section not found:", sectionId);
        return;
    }

    section.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function addCustomizedProduct() {

    console.log("Adding customized product...");

    // Try to use the existing customization function
    if (typeof addToCart === "function") {
        addToCart();
        return;
    }

    // If your project uses a different function,
    // show a useful message instead of breaking the page.
    console.warn("addToCart function was not found.");

    alert("Please complete your coffee customization first.");
}