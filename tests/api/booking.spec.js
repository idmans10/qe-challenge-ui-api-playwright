import { test, expect, attachJson } from '../../src/fixtures/api.fixtures.js';
import { BookingFactory } from '../../src/api/factories/BookingFactory.js';

test.describe('Restful-Booker /booking', () => {
  test('API-01 creates a booking and persists it', async ({ bookingClient, bookingCleanup }, testInfo) => {
    // Arrange
    const payload = BookingFactory.build();
    await attachJson(testInfo, 'booking-payload', payload);

    // Act
    const createResponse = await bookingClient.create(payload);
    // Registered before any assertion, whatever the status, so a created booking is never left behind.
    const bookingId = await bookingCleanup.trackCreated(createResponse, payload);

    // Assert
    expect(createResponse.status(), 'POST /booking status').toBe(200);
    const created = await createResponse.json();
    expect(created.bookingid).toBe(bookingId);
    expect(created.bookingid).toBeGreaterThan(0);
    expect(created.booking).toEqual(payload);
    expect(bookingCleanup.has(bookingId)).toBe(true);

    const getResponse = await bookingClient.get(bookingId);
    expect(getResponse.status(), 'GET /booking/:id status').toBe(200);
    expect(await getResponse.json()).toEqual(payload);
  });

  test('API-02 updates an existing booking with PUT', async ({ booking, authorizedBookingClient, bookingClient, bookingCleanup }, testInfo) => {
    // Arrange
    const original = booking.payload;
    const changes = BookingFactory.build(
      { totalprice: original.totalprice + 50, depositpaid: !original.depositpaid, additionalneeds: 'Late checkout' },
      { daysAhead: 60, nights: 5 },
    );
    const unchangedFields = Object.keys(changes).filter((key) => JSON.stringify(changes[key]) === JSON.stringify(original[key]));
    expect(unchangedFields, 'every field of the update payload must differ from the original').toEqual([]);
    await attachJson(testInfo, 'update-payload', changes);
    await bookingCleanup.assertOwnership(booking.id);
    bookingCleanup.recordUpdate(booking.id, changes);

    // Act
    const updateResponse = await authorizedBookingClient.update(booking.id, changes);

    // Assert
    expect(updateResponse.status(), 'PUT /booking/:id status').toBe(200);
    expect(await updateResponse.json()).toEqual(changes);

    const getResponse = await bookingClient.get(booking.id);
    expect(getResponse.status(), 'GET /booking/:id status').toBe(200);
    expect(await getResponse.json()).toEqual(changes);
  });

  test('API-03 deletes an existing booking', async ({ booking, authorizedBookingClient, bookingClient, bookingCleanup }) => {
    // Arrange
    await bookingCleanup.assertOwnership(booking.id);

    // Act
    const deleteResponse = await authorizedBookingClient.delete(booking.id);

    // Assert
    expect(deleteResponse.status(), 'DELETE /booking/:id status (Restful-Booker documents 201 Created)').toBe(201);

    const getResponse = await bookingClient.get(booking.id);
    expect(getResponse.status(), 'GET /booking/:id after delete').toBe(404);
  });
});
