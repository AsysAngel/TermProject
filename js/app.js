$(document).ready(function () {
    const API_KEY = 'ae73526901baeb417f9b6c1a83ef9204'; // TMDb API key
    const BASE_URL = 'https://api.themoviedb.org/3';
    let currentPage = 1;
    let totalPages = 1;
    let sessionId = localStorage.getItem('tmdb_session_id') || '44ec7f93139143f1c1727f18d29be3f5c2e92c51'; // Default session_id
    let accountId = localStorage.getItem('tmdb_account_id') || '22163432'; // Default accountId
    let viewMode = 'grid'; // Grid or list view
    const MAX_RETRIES = 3; // For rate limit handling
    const RETRY_DELAY = 10000; // 10 seconds for 429 errors

    // Validate API key
    function validateApiKey() {
        if (!API_KEY || API_KEY === 'YOUR_API_KEY') {
            alert('Invalid API key. Please set a valid TMDb API key in app.js.');
            return false;
        }
        return true;
    }

    // Retryable AJAX wrapper for rate limits
    function ajaxWithRetry(url, options, retries = MAX_RETRIES) {
        return new Promise((resolve, reject) => {
            function attempt() {
                $.ajax({
                    url: url,
                    ...options,
                    success: function (data) {
                        resolve(data);
                    },
                    error: function (xhr) {
                        if (xhr.status === 429 && retries > 0) {
                            console.warn(`Rate limit hit, retrying in ${RETRY_DELAY/1000}s... (${retries} retries left)`);
                            setTimeout(() => {
                                attempt();
                            }, RETRY_DELAY);
                        } else {
                            reject(xhr);
                        }
                    }
                });
            }
            attempt();
        });
    }

    // Load popular movies on page load
    loadPopularMovies();

    // Search button click
    $('#searchBtn').click(function (e) {
        e.preventDefault();
        if (!validateApiKey()) return;
        currentPage = 1;
        searchMedia();
    });

    // Toggle view (grid/list)
    $('#toggleView').click(function () {
        viewMode = viewMode === 'grid' ? 'list' : 'grid';
        $('#results').removeClass('grid list').addClass(viewMode);
        searchMedia(); // Refresh results with new view
    });

    // Pagination
    $(document).on('click', '.page-link', function (e) {
        e.preventDefault();
        if (!validateApiKey()) return;
        currentPage = parseInt($(this).data('page'));
        searchMedia();
    });

    // Navigation: Home, Favorites, Watchlist
    $('#home').click(function (e) {
        e.preventDefault();
        if (!validateApiKey()) return;
        currentPage = 1;
        loadPopularMovies();
    });

    $('#favorites').click(function (e) {
        e.preventDefault();
        if (sessionId && accountId) {
            loadFavorites();
        } else {
            alert('Please log in to view favorites.');
        }
    });

    $('#watchlist').click(function (e) {
        e.preventDefault();
        if (sessionId && accountId) {
            loadWatchlist();
        } else {
            alert('Please log in to view watchlist.');
        }
    });

    // Login (user authentication flow or guest session)
    $('#login').click(function (e) {
        e.preventDefault();
        if (!validateApiKey()) return;

        // Step 1: Create request token
        console.log('Creating request token...');
        ajaxWithRetry(`${BASE_URL}/authentication/token/new?api_key=${API_KEY}`, {
            method: 'GET'
        }).then(data => {
            if (data.success && data.request_token) {
                const requestToken = data.request_token;
                console.log('Request token created:', requestToken);
                // Step 2: Display authentication URL in UI
                const authUrl = `https://www.themoviedb.org/authenticate/${requestToken}`;
                $('#results').html(`
                    <div class="alert alert-info">
                        <p>Please visit <a href="${authUrl}" target="_blank">${authUrl}</a> to approve the request token.</p>
                        <p>After approving, click the button below to continue.</p>
                        <button id="continueAuth" class="btn btn-primary">Continue</button>
                        <button id="useGuestSession" class="btn btn-secondary">Use Guest Session Instead</button>
                    </div>
                `);

                // Step 3: Handle continue button
                $('#continueAuth').one('click', function () {
                    ajaxWithRetry(`${BASE_URL}/authentication/session/new?api_key=${API_KEY}`, {
                        method: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify({ request_token: requestToken })
                    }).then(sessionData => {
                        if (sessionData.success && sessionData.session_id) {
                            sessionId = sessionData.session_id;
                            localStorage.setItem('tmdb_session_id', sessionId);
                            console.log('Session ID created successfully:', sessionId);
                            fetchAccountId();
                        } else {
                            console.error('Session creation response invalid:', sessionData);
                            alert('Session creation failed: Invalid response. Trying guest session...');
                            createGuestSession();
                        }
                    }).catch(xhr => {
                        console.error('Session creation failed:', {
                            status: xhr.status,
                            statusText: xhr.statusText,
                            response: xhr.responseJSON
                        });
                        alert(`Error creating session: ${xhr.responseJSON?.status_message || xhr.statusText}. Trying guest session...`);
                        createGuestSession();
                    });
                });

                // Step 4: Handle guest session option
                $('#useGuestSession').one('click', function () {
                    console.log('User chose guest session.');
                    createGuestSession();
                });
            } else {
                console.error('Request token response invalid:', data);
                alert('Request token creation failed: Invalid response. Trying guest session...');
                createGuestSession();
            }
        }).catch(xhr => {
            console.error('Request token creation failed:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            console.log('To obtain a request token manually, run: Invoke-WebRequest -Method GET -Uri "https://api.themoviedb.org/3/authentication/token/new?api_key=' + API_KEY + '"');
            alert(`Error creating request token: ${xhr.responseJSON?.status_message || xhr.statusText}. Trying guest session...`);
            createGuestSession();
        });
    });

    // Fallback: Create guest session
    function createGuestSession() {
        console.log('Attempting to create guest session...');
        ajaxWithRetry(`${BASE_URL}/authentication/guest_session/new?api_key=${API_KEY}`, {
            method: 'GET'
        }).then(data => {
            if (data.success && data.guest_session_id) {
                sessionId = data.guest_session_id;
                localStorage.setItem('tmdb_session_id', sessionId);
                console.log('Guest session created successfully:', sessionId);
                fetchAccountId();
            } else {
                console.error('Guest session response invalid:', data);
                alert('Guest session creation failed: Invalid response from server.');
                // Fallback: Prompt for manual session ID
                sessionId = prompt('Guest session failed. Enter a valid TMDb session ID for testing (run: Invoke-WebRequest -Method GET -Uri "https://api.themoviedb.org/3/authentication/guest_session/new?api_key=' + API_KEY + '"):');
                if (sessionId) {
                    localStorage.setItem('tmdb_session_id', sessionId);
                    console.log('Using manual session ID:', sessionId);
                    fetchAccountId();
                } else {
                    alert('No session ID provided. Favorites and watchlist features will be disabled.');
                }
            }
        }).catch(xhr => {
            console.error('Guest session creation failed:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            console.log('To obtain a guest session ID, run: Invoke-WebRequest -Method GET -Uri "https://api.themoviedb.org/3/authentication/guest_session/new?api_key=' + API_KEY + '"');
            alert(`Error creating guest session: ${xhr.responseJSON?.status_message || xhr.statusText}. Check console for manual session ID instructions.`);
            // Fallback: Prompt for manual session ID
            sessionId = prompt('Guest session failed. Enter a valid TMDb session ID for testing (run: Invoke-WebRequest -Method GET -Uri "https://api.themoviedb.org/3/authentication/guest_session/new?api_key=' + API_KEY + '"):');
            if (sessionId) {
                localStorage.setItem('tmdb_session_id', sessionId);
                console.log('Using manual session ID:', sessionId);
                fetchAccountId();
            } else {
                alert('No session ID provided. Favorites and watchlist features will be disabled.');
            }
        });
    }

    // Function to fetch account ID
    function fetchAccountId() {
        if (!sessionId) {
            alert('No session ID available. Please try logging in again.');
            return;
        }
        console.log('Fetching account ID with session ID:', sessionId);
        ajaxWithRetry(`${BASE_URL}/account?api_key=${API_KEY}&session_id=${sessionId}`, {
            method: 'GET'
        }).then(data => {
            if (data.id) {
                accountId = data.id;
                localStorage.setItem('tmdb_account_id', accountId);
                console.log('Account ID fetched successfully:', accountId);
                alert('Logged in successfully! Account ID: ' + accountId);
            } else {
                console.error('Account ID response invalid:', data);
                alert('Error fetching account ID: Invalid response from server.');
                sessionId = null;
                accountId = null;
                localStorage.removeItem('tmdb_session_id');
                localStorage.removeItem('tmdb_account_id');
            }
        }).catch(xhr => {
            console.error('Account ID fetch error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            console.log('To verify session ID, run: Invoke-WebRequest -Method GET -Uri "https://api.themoviedb.org/3/account?api_key=' + API_KEY + '&session_id=' + sessionId + '"');
            alert(`Error fetching account ID: ${xhr.responseJSON?.status_message || xhr.statusText}. Check console for debugging instructions.`);
            sessionId = null;
            accountId = null;
            localStorage.removeItem('tmdb_session_id');
            localStorage.removeItem('tmdb_account_id');
        });
    }

    // Search media 
    function searchMedia() {
        const query = $('#searchInput').val();
        const searchType = $('#searchType').val();
        const sortBy = $('#sortOptions').val();
        let url = `${BASE_URL}/search/${searchType}?api_key=${API_KEY}&language=en-US&query=${encodeURIComponent(query)}&page=${currentPage}&sort_by=${sortBy}`;

        if (!query) {
            url = `${BASE_URL}/discover/${searchType === 'multi' ? 'movie' : searchType}?api_key=${API_KEY}&language=en-US&page=${currentPage}&sort_by=${sortBy}`;
        }

        $('#results').html('<p>Loading...</p>');
        ajaxWithRetry(url, {
            method: 'GET'
        }).then(data => {
            totalPages = data.total_pages || 1;
            displayResults(data.results, searchType);
            updatePagination();
        }).catch(xhr => {
            console.error('Search error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error fetching data: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    }

    // Load popular movies
    function loadPopularMovies() {
        $('#results').html('<p>Loading...</p>');
        ajaxWithRetry(`${BASE_URL}/movie/popular?api_key=${API_KEY}&language=en-US&page=${currentPage}`, {
            method: 'GET'
        }).then(data => {
            totalPages = data.total_pages || 1;
            displayResults(data.results, 'movie');
            updatePagination();
        }).catch(xhr => {
            console.error('Popular movies error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error fetching popular movies: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    }

    // Load favorites
    function loadFavorites() {
        if (!sessionId || !accountId) {
            $('#results').html('<p>Please log in to view favorites.</p>');
            return;
        }
        $('#results').html('<p>Loading...</p>');
        ajaxWithRetry(`${BASE_URL}/account/${accountId}/favorite/movies?api_key=${API_KEY}&session_id=${sessionId}&language=en-US`, {
            method: 'GET'
        }).then(data => {
            displayResults(data.results, 'movie');
        }).catch(xhr => {
            console.error('Favorites error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error fetching favorites: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    }

    // Load watchlist
    function loadWatchlist() {
        if (!sessionId || !accountId) {
            $('#results').html('<p>Please log in to view watchlist.</p>');
            return;
        }
        $('#results').html('<p>Loading...</p>');
        ajaxWithRetry(`${BASE_URL}/account/${accountId}/watchlist/movies?api_key=${API_KEY}&session_id=${sessionId}&language=en-US`, {
            method: 'GET'
        }).then(data => {
            displayResults(data.results, 'movie');
        }).catch(xhr => {
            console.error('Watchlist error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error fetching watchlist: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    }

    // Display search results
    function displayResults(results, searchType) {
        $('#details').addClass('d-none');
        $('#results').removeClass('d-none').html('');
        results.forEach(item => {
            // Skip person results in multi-search
            if (searchType === 'multi' && item.media_type === 'person') return;
            const title = item.title || item.name || 'Unknown Title';
            const poster = item.poster_path ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/200x300';
            const mediaType = item.media_type || (searchType === 'multi' ? item.media_type : searchType);
            const html = viewMode === 'grid' ?
                `<div class="card">
                    <img src="${poster}" class="card-img-top poster" alt="${title}">
                    <div class="card-body">
                        <h5 class="card-title">${title}</h5>
                        <button class="btn btn-primary details-btn" data-id="${item.id}" data-type="${mediaType}">Details</button>
                        ${sessionId && accountId ? `<button class="btn btn-secondary favorite-btn" data-id="${item.id}" data-type="${mediaType}">Add to Favorites</button>` : ''}
                        ${sessionId && accountId ? `<button class="btn btn-secondary watchlist-btn" data-id="${item.id}" data-type="${mediaType}">Add to Watchlist</button>` : ''}
                    </div>
                </div>` :
                `<div class="media">
                    <img src="${poster}" class="mr-3 poster" alt="${title}">
                    <div class="media-body">
                        <h5>${title}</h5>
                        <button class="btn btn-primary details-btn" data-id="${item.id}" data-type="${mediaType}">Details</button>
                        ${sessionId && accountId ? `<button class="btn btn-secondary favorite-btn" data-id="${item.id}" data-type="${mediaType}">Add to Favorites</button>` : ''}
                        ${sessionId && accountId ? `<button class="btn btn-secondary watchlist-btn" data-id="${item.id}" data-type="${mediaType}">Add to Watchlist</button>` : ''}
                    </div>
                </div>`;
            $('#results').append(html);
        });
        if (results.length === 0) {
            $('#results').html('<p>No results found.</p>');
        }
    }

    // Display details for movie/TV/person
    $(document).on('click', '.details-btn', function () {
        const id = $(this).data('id');
        const type = $(this).data('type');
        let url = `${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US&append_to_response=credits,reviews`;

        $('#details').html('<p>Loading...</p>');
        ajaxWithRetry(url, {
            method: 'GET'
        }).then(data => {
            $('#results').addClass('d-none');
            $('#details').removeClass('d-none').html(`
                <h2>${data.title || data.name || 'Unknown'}</h2>
                <img src="${data.poster_path ? 'https://image.tmdb.org/t/p/w300' + data.poster_path : 'https://via.placeholder.com/300x450'}" alt="${data.title || data.name || 'Unknown'}">
                <p>${data.overview || data.biography || 'No description available.'}</p>
                ${type === 'person' ? `<p><strong>Birthday:</strong> ${data.birthday || 'N/A'}</p>` : `<p><strong>Release Date:</strong> ${data.release_date || data.first_air_date || 'N/A'}</p>`}
                ${type !== 'person' ? `<h3>Cast</h3><ul>${(data.credits?.cast || []).slice(0, 5).map(actor => `<li><a href="#" class="person-details" data-id="${actor.id}">${actor.name}</a></li>`).join('')}</ul>` : ''}
                ${type !== 'person' ? `<h3>Reviews</h3><ul>${(data.reviews?.results || []).slice(0, 3).map(review => `<li>${review.author}: ${review.content.substring(0, 100)}...</li>`).join('')}</ul>` : ''}
            `);
        }).catch(xhr => {
            console.error('Details error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#details').html(`<p>Error fetching details: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    });

    // Display person details
    $(document).on('click', '.person-details', function (e) {
        e.preventDefault();
        const id = $(this).data('id');
        $('#details').html('<p>Loading...</p>');
        ajaxWithRetry(`${BASE_URL}/person/${id}?api_key=${API_KEY}&language=en-US`, {
            method: 'GET'
        }).then(data => {
            $('#results').addClass('d-none');
            $('#details').removeClass('d-none').html(`
                <h2>${data.name || 'Unknown'}</h2>
                <img src="${data.profile_path ? 'https://image.tmdb.org/t/p/w300' + data.profile_path : 'https://via.placeholder.com/300x450'}" alt="${data.name || 'Unknown'}">
                <p><strong>Biography:</strong> ${data.biography || 'N/A'}</p>
                <p><strong>Birthday:</strong> ${data.birthday || 'N/A'}</p>
                <p><strong>Place of Birth:</strong> ${data.place_of_birth || 'N/A'}</p>
            `);
        }).catch(xhr => {
            console.error('Person details error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#details').html(`<p>Error fetching person details: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    });

    // Add to favorites
    $(document).on('click', '.favorite-btn', function () {
        if (!sessionId || !accountId) {
            alert('Please log in to add to favorites.');
            return;
        }
        const id = $(this).data('id');
        const type = $(this).data('type');
        console.log('Adding to favorites:', { media_id: id, media_type: type });
        ajaxWithRetry(`${BASE_URL}/account/${accountId}/favorite?api_key=${API_KEY}&session_id=${sessionId}`, {
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                media_type: type,
                media_id: id,
                favorite: true
            })
        }).then(() => {
            alert('Added to favorites!');
        }).catch(xhr => {
            console.error('Add to favorites error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error adding to favorites: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    });

    // Add to watchlist
    $(document).on('click', '.watchlist-btn', function () {
        if (!sessionId || !accountId) {
            alert('Please log in to add to watchlist.');
            return;
        }
        const id = $(this).data('id');
        const type = $(this).data('type');
        console.log('Adding to watchlist:', { media_id: id, media_type: type });
        ajaxWithRetry(`${BASE_URL}/account/${accountId}/watchlist?api_key=${API_KEY}&session_id=${sessionId}`, {
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
                media_type: type,
                media_id: id,
                watchlist: true
            })
        }).then(() => {
            alert('Added to watchlist!');
        }).catch(xhr => {
            console.error('Add to watchlist error:', {
                status: xhr.status,
                statusText: xhr.statusText,
                response: xhr.responseJSON
            });
            $('#results').html(`<p>Error adding to watchlist: ${xhr.responseJSON?.status_message || xhr.statusText}</p>`);
        });
    });

    // Update pagination
    function updatePagination() {
        $('#pagination').html(`
            <nav>
                <ul class="pagination">
                    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
                        <a class="page-link" href="#" data-page="${currentPage - 1}">Previous</a>
                    </li>
                    ${Array.from({ length: Math.min(5, totalPages) }, (_, i) => `
                        <li class="page-item ${currentPage === i + 1 ? 'active' : ''}">
                            <a class="page-link" href="#" data-page="${i + 1}">${i + 1}</a>
                        </li>
                    `).join('')}
                    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
                        <a class="page-link" href="#" data-page="${currentPage + 1}">Next</a>
                    </li>
                </ul>
            </nav>
        `);
    }
});
