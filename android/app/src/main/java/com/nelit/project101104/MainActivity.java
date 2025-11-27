package com.nelit.project101104;

import android.Manifest;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import android.content.pm.PackageManager;

public class MainActivity extends BridgeActivity {
	private static final int LOCATION_REQUEST_CODE = 1234;

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		// Request location permissions at startup (will show system prompt)
		requestLocationPermissionsIfNeeded();
		// Ensure the window does not draw behind the status bar
		try {
			getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
			// For newer APIs ensure status bar is not translucent
			getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
		} catch (Exception e) {
			// ignore on older devices
		}
		// Attempt to hide the status bar so the app appears full-screen
		try {
			if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
				// API 30+ WindowInsetsController
				final android.view.WindowInsetsController controller = getWindow().getInsetsController();
				if (controller != null) controller.hide(android.view.WindowInsets.Type.statusBars());
			} else {
				// deprecated flags for older devices
				getWindow().getDecorView().setSystemUiVisibility(
					android.view.View.SYSTEM_UI_FLAG_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
				);
			}
		} catch (Exception e) {
			// ignore if hiding not supported
		}
	}

	private void requestLocationPermissionsIfNeeded() {
		boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
		boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
		if (!fine || !coarse) {
			ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST_CODE);
		}
	}

	@Override
	public void onResume() {
		super.onResume();
		// Re-check permissions when app comes to foreground
		requestLocationPermissionsIfNeeded();
	}

	@Override
	public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
		super.onRequestPermissionsResult(requestCode, permissions, grantResults);
		if (requestCode == LOCATION_REQUEST_CODE) {
			boolean granted = true;
			for (int r : grantResults) {
				if (r != PackageManager.PERMISSION_GRANTED) { granted = false; break; }
			}
			// Log result so webview console/logcat can show it if needed
			android.util.Log.i("MainActivity", "Location permissions granted=" + granted);
		}
	}

}
