/**
 * Hello World Settings Component
 *
 * Settings tab displayed in the Admin settings page.
 */
import React, { useState } from 'react';

export function HelloWorldSettings() {
    const [greeting, setGreeting] = useState('Hello');

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Hello World Settings</h3>
                <p className="text-sm text-muted-foreground">
                    Configure the Hello World plugin behavior.
                </p>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <label htmlFor="greeting" className="text-sm font-medium">
                        Greeting Message
                    </label>
                    <input
                        id="greeting"
                        type="text"
                        value={greeting}
                        onChange={(e) => setGreeting(e.target.value)}
                        className="flex h-10 w-full max-w-sm rounded-md border border-input bg-background px-3 py-2 text-sm"
                        placeholder="Enter greeting..."
                    />
                    <p className="text-sm text-muted-foreground">
                        The greeting message returned by the API.
                    </p>
                </div>

                <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Save Settings
                </button>
            </div>
        </div>
    );
}

export default HelloWorldSettings;
