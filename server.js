
require('dotenv').config();



const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI is missing from environment variables.');
    process.exit(1);
}

const client = new MongoClient(process.env.MONGODB_URI);

let weatherCollection;

app.use(express.json());
app.use(express.static(__dirname));

function getWeatherCondition(code) {
    const conditions = {
        0: 'Clear Sky',
        1: 'Mainly Clear',
        2: 'Partly Cloudy',
        3: 'Overcast',
        45: 'Foggy',
        48: 'Depositing Rime Fog',
        51: 'Light Drizzle',
        53: 'Moderate Drizzle',
        55: 'Dense Drizzle',
        56: 'Light Freezing Drizzle',
        57: 'Dense Freezing Drizzle',
        61: 'Slight Rain',
        63: 'Moderate Rain',
        65: 'Heavy Rain',
        66: 'Light Freezing Rain',
        67: 'Heavy Freezing Rain',
        71: 'Slight Snowfall',
        73: 'Moderate Snowfall',
        75: 'Heavy Snowfall',
        77: 'Snow Grains',
        80: 'Slight Rain Showers',
        81: 'Moderate Rain Showers',
        82: 'Violent Rain Showers',
        85: 'Slight Snow Showers',
        86: 'Heavy Snow Showers',
        95: 'Thunderstorm',
        96: 'Thunderstorm with Slight Hail',
        99: 'Thunderstorm with Heavy Hail'
    };

    return conditions[code] || 'Unknown Weather';
}

// Home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Get weather information for a location
app.post('/weather/location', async (req, res) => {
    try {
        const { location } = req.body;

        if (
            !location ||
            typeof location !== 'string' ||
            !location.trim()
        ) {
            return res.status(400).json({
                error: 'Please enter a valid location.'
            });
        }

        const geocodingURL =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location.trim())}&count=1&language=en&format=json`;

        const geocodingResponse = await fetch(geocodingURL);

        if (!geocodingResponse.ok) {
            throw new Error('Unable to search for the location.');
        }

        const geocodingData = await geocodingResponse.json();

        if (
            !geocodingData.results ||
            geocodingData.results.length === 0
        ) {
            return res.status(404).json({
                error: 'Location not found. Please enter another location.'
            });
        }

        const place = geocodingData.results[0];

        const weatherURL =
            `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,wind_speed_10m,weather_code&timezone=auto`;

        const weatherResponse = await fetch(weatherURL);

        if (!weatherResponse.ok) {
            throw new Error('Unable to retrieve weather information.');
        }

        const weatherData = await weatherResponse.json();
        const current = weatherData.current;

        if (!current) {
            throw new Error('Weather information is unavailable.');
        }

        const report = {
            location: place.name,
            region: place.admin1 || '',
            country: place.country || '',
            latitude: place.latitude,
            longitude: place.longitude,
            temperature: current.temperature_2m,
            humidity: current.relative_humidity_2m,
            feelsLike: current.apparent_temperature,
            precipitation: current.precipitation,
            windSpeed: current.wind_speed_10m,
            status: getWeatherCondition(current.weather_code),
            weatherTime: current.time,
            timestamp: new Date()
        };

        const result = await weatherCollection.insertOne(report);

        res.json({
            message: 'Weather information retrieved successfully.',
            id: result.insertedId,
            ...report
        });

    } catch (error) {
        console.error('Weather API error:', error.message);

        res.status(500).json({
            error: 'Unable to retrieve weather information. Please try again.'
        });
    }
});

// Get all saved weather reports
app.get('/weather/all', async (req, res) => {
    try {
        const reports = await weatherCollection
            .find({})
            .sort({ timestamp: -1 })
            .toArray();

        res.json(reports);

    } catch (error) {
        console.error('Database error:', error.message);

        res.status(500).json({
            error: 'Unable to retrieve saved weather reports.'
        });
    }
});

// Connect to MongoDB and start the server
async function startServer() {
    try {
        await client.connect();

        const db = client.db('weather_station');
        weatherCollection = db.collection('weather');

        console.log('Connected to MongoDB Atlas successfully.');

        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Weather Station running on port ${PORT}`);
        });

    } catch (error) {
        console.error('Server startup failed:', error.message);

        await client.close().catch(() => {});
        process.exit(1);
    }
}

// Close MongoDB connection when stopping the server
process.on('SIGINT', async () => {
    console.log('\nClosing MongoDB connection...');

    try {
        await client.close();
    } finally {
        process.exit(0);
    }
});

startServer();
