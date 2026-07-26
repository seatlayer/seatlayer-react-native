# Security

Report security issues privately through
[GitHub Security Advisories](https://github.com/seatlayer/seatlayer-react-native/security/advisories/new).
Do not open a public issue for a suspected vulnerability.

The React Native SDK is a public-client integration. It may select and hold
inventory, but it must never contain a SeatLayer secret key or create bookings
directly. Booking belongs on a trusted backend after payment or order
validation.
