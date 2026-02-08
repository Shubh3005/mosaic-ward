# test_detection.py
from detection_logic import is_fall_detected, calculate_velocity

def test_fall_detection_positive():
    # Simulate a fast drop to the floor
    result = is_fall_detected(velocity=3.0, y_position=0.9)
    assert result == True

def test_fall_detection_negative_just_lying_down():
    # Patient is on floor but moved slowly (e.g., sleeping)
    result = is_fall_detected(velocity=0.1, y_position=0.9)
    assert result == False

def test_velocity_calculation():
    # Moved 100 pixels in 0.1 seconds
    vel = calculate_velocity(current_y=200, previous_y=100, time_delta=0.1)
    assert vel == 1000.0